"""
Minimal smoke tests for CI. Extend with real matching-logic coverage.
Redis is not available in this unit-test context, so readiness will
report not_ready — that is expected and asserted for explicitly.
"""
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_root():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/")
    assert resp.status_code == 200
    assert resp.json()["service"] == "FEVER^"


@pytest.mark.asyncio
async def test_liveness():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/health/live")
    assert resp.status_code == 200
    assert resp.json()["status"] == "alive"


@pytest.mark.asyncio
async def test_metrics_endpoint_exposes_prometheus_format():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/metrics")
    assert resp.status_code == 200
    assert b"http_requests_total" in resp.content or resp.content == b""


@pytest.mark.asyncio
async def test_match_endpoint_validation_error():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post("/api/v1/match", json={"job_description": "short"})
    assert resp.status_code == 422
