"""
FEVER^ - High-throughput Resume Matching Engine
Core FastAPI application: async execution, Redis pooling, Prometheus metrics,
and Kubernetes-native health probes.

Run with: uvicorn app.main:app --host 0.0.0.0 --port 8000 --loop uvloop --workers 1
(Horizontal scaling handled by K8s HPA + multiple pods, not multi-worker per pod,
to keep Prometheus per-pod metrics meaningful.)

Designed and Developed by Nikhil Chary Sriramoju
GitHub:   https://github.com/Nikhil-creat
LinkedIn: https://in.linkedin.com/in/nikhil-chary-sriramoju-95041b38a
Email:    sriramojunikhil66@gmail.com
Phone:    +91 6300556301
"""

import asyncio
import time
import logging
from contextlib import asynccontextmanager
from typing import Optional

import psutil
import redis.asyncio as aioredis
from fastapi import FastAPI, Request, Response, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_client import Counter, Histogram, CONTENT_TYPE_LATEST, generate_latest
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("fever")

# --------------------------------------------------------------------------
# Configuration (env-driven; sane defaults for local dev)
# --------------------------------------------------------------------------
import os

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
REDIS_MAX_CONNECTIONS = int(os.getenv("REDIS_MAX_CONNECTIONS", "50"))
MEMORY_THRESHOLD_PCT = float(os.getenv("MEMORY_THRESHOLD_PCT", "90.0"))
APP_VERSION = os.getenv("APP_VERSION", "1.0.0")

# Comma-separated list of allowed origins for the browser-based demo hosted on
# GitHub Pages (e.g. "https://nikhil-creat.github.io"). Defaults to "*" for
# local/dev convenience — lock this down to your actual Pages origin in prod.
CORS_ALLOWED_ORIGINS = [
    o.strip() for o in os.getenv("CORS_ALLOWED_ORIGINS", "*").split(",") if o.strip()
]

# --------------------------------------------------------------------------
# Prometheus metrics
# --------------------------------------------------------------------------
HTTP_REQUESTS_TOTAL = Counter(
    "http_requests_total",
    "Total number of HTTP requests processed",
    ["method", "path", "status_code"],
)

HTTP_REQUEST_DURATION_SECONDS = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency in seconds",
    ["method", "path"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10),
)

REDIS_CACHE_HITS = Counter("fever_redis_cache_hits_total", "Redis cache hits")
REDIS_CACHE_MISSES = Counter("fever_redis_cache_misses_total", "Redis cache misses")


# --------------------------------------------------------------------------
# Lifespan: Redis connection pool setup/teardown
# --------------------------------------------------------------------------
class AppState:
    redis_pool: Optional[aioredis.Redis] = None


state = AppState()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up: initializing Redis connection pool")
    state.redis_pool = aioredis.from_url(
        REDIS_URL,
        max_connections=REDIS_MAX_CONNECTIONS,
        decode_responses=True,
        socket_connect_timeout=2,
        socket_timeout=2,
        health_check_interval=30,
    )
    try:
        await state.redis_pool.ping()
        logger.info("Redis connection established")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Redis not reachable at startup: %s", exc)

    yield

    logger.info("Shutting down: closing Redis connection pool")
    if state.redis_pool is not None:
        await state.redis_pool.aclose()


app = FastAPI(
    title="FEVER^ Resume Matching Engine",
    version=APP_VERSION,
    lifespan=lifespan,
)

# Enables the GitHub Pages-hosted static demo (docs/index.html) to call this
# API cross-origin. Restrict CORS_ALLOWED_ORIGINS in production instead of "*".
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


# --------------------------------------------------------------------------
# Middleware: Prometheus request/latency instrumentation
# --------------------------------------------------------------------------
@app.middleware("http")
async def prometheus_middleware(request: Request, call_next):
    # Avoid label cardinality explosion: normalize path to route template if available
    start_time = time.perf_counter()
    try:
        response: Response = await call_next(request)
        status_code = response.status_code
    except Exception:
        status_code = 500
        raise
    finally:
        duration = time.perf_counter() - start_time
        route = request.scope.get("route")
        path_label = route.path if route is not None else request.url.path
        HTTP_REQUESTS_TOTAL.labels(
            method=request.method, path=path_label, status_code=str(status_code)
        ).inc()
        HTTP_REQUEST_DURATION_SECONDS.labels(
            method=request.method, path=path_label
        ).observe(duration)
    return response


# --------------------------------------------------------------------------
# Metrics scrape endpoint
# --------------------------------------------------------------------------
@app.get("/metrics", include_in_schema=False)
async def metrics():
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


# --------------------------------------------------------------------------
# Kubernetes health probes
# --------------------------------------------------------------------------
@app.get("/health/live", include_in_schema=False)
async def health_live():
    """
    Liveness: process is alive and event loop is responsive.
    Kept intentionally cheap — no external dependency calls.
    """
    return {"status": "alive"}


@app.get("/health/ready", include_in_schema=False)
async def health_ready():
    """
    Readiness: validates Redis connectivity and system memory headroom.
    A pod failing readiness is removed from Service endpoints but NOT restarted.
    """
    checks = {"redis": False, "memory": False}

    # Redis ping check
    try:
        if state.redis_pool is not None:
            await asyncio.wait_for(state.redis_pool.ping(), timeout=1.5)
            checks["redis"] = True
    except Exception as exc:  # noqa: BLE001
        logger.warning("Readiness Redis check failed: %s", exc)

    # Memory safeguard check
    mem = psutil.virtual_memory()
    checks["memory"] = mem.percent < MEMORY_THRESHOLD_PCT

    all_ready = all(checks.values())
    payload = {"status": "ready" if all_ready else "not_ready", "checks": checks,
               "memory_percent": mem.percent}

    if not all_ready:
        return JSONResponse(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, content=payload)
    return payload


# --------------------------------------------------------------------------
# Domain models & matching endpoint (CPU-bound work offloaded via asyncio.to_thread)
# --------------------------------------------------------------------------
class MatchRequest(BaseModel):
    job_description: str = Field(..., min_length=10)
    resume_text: str = Field(..., min_length=10)
    candidate_id: str = Field(..., min_length=1)


class MatchResponse(BaseModel):
    candidate_id: str
    score: float
    cached: bool


def _cpu_bound_match_score(job_description: str, resume_text: str) -> float:
    """
    Placeholder for a CPU-intensive matching algorithm (e.g. embedding similarity,
    TF-IDF cosine, or a transformer inference call). Run via asyncio.to_thread so
    it doesn't block the event loop under concurrent load.
    """
    jd_tokens = set(job_description.lower().split())
    resume_tokens = set(resume_text.lower().split())
    if not jd_tokens:
        return 0.0
    overlap = jd_tokens.intersection(resume_tokens)
    return round(len(overlap) / len(jd_tokens), 4)


@app.post("/api/v1/match", response_model=MatchResponse)
async def match_resume(payload: MatchRequest):
    cache_key = f"match:{payload.candidate_id}:{hash(payload.job_description)}"
    cached_value = None

    if state.redis_pool is not None:
        try:
            cached_value = await state.redis_pool.get(cache_key)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Redis GET failed, degrading gracefully: %s", exc)

    if cached_value is not None:
        REDIS_CACHE_HITS.inc()
        return MatchResponse(candidate_id=payload.candidate_id, score=float(cached_value), cached=True)

    REDIS_CACHE_MISSES.inc()

    # Offload CPU-bound scoring to a worker thread to keep the event loop free
    score = await asyncio.to_thread(
        _cpu_bound_match_score, payload.job_description, payload.resume_text
    )

    if state.redis_pool is not None:
        try:
            await state.redis_pool.set(cache_key, score, ex=300)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Redis SET failed, continuing without cache: %s", exc)

    return MatchResponse(candidate_id=payload.candidate_id, score=score, cached=False)


@app.get("/")
async def root():
    return {"service": "FEVER^", "version": APP_VERSION, "status": "running"}
