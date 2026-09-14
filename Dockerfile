# ============================================================================
# FEVER^ — Multi-stage, security-hardened production Dockerfile
#
# Designed and Developed by Nikhil Chary Sriramoju
# GitHub: https://github.com/Nikhil-creat | LinkedIn: https://in.linkedin.com/in/nikhil-chary-sriramoju-95041b38a
# Email: sriramojunikhil66@gmail.com | Phone: +91 6300556301
# ============================================================================

# ---- Stage 1: builder ------------------------------------------------------
# Heavy build toolchain isolated here; never ships to runtime image.
FROM python:3.12-slim AS builder

WORKDIR /build

# Build-time system deps only (compilers for any C-extension wheels)
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc build-essential \
    && rm -rf /var/lib/apt/lists/*

# Leverage Docker layer caching: copy only requirements first
COPY app/requirements.txt .

# Build wheels so runtime stage installs pre-compiled artifacts (no compiler needed there)
RUN pip install --upgrade pip \
    && pip wheel --no-cache-dir --wheel-dir /build/wheels -r requirements.txt


# ---- Stage 2: runtime -------------------------------------------------------
FROM python:3.12-slim AS runtime

LABEL org.opencontainers.image.title="fever-matching-engine" \
      org.opencontainers.image.description="FEVER^ high-throughput resume matching engine" \
      org.opencontainers.image.vendor="FEVER^" \
      org.opencontainers.image.authors="Nikhil Chary Sriramoju <sriramojunikhil66@gmail.com>" \
      org.opencontainers.image.url="https://github.com/Nikhil-creat"

# Minimal runtime OS deps only (no compilers, no dev headers)
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 1001 fever \
    && useradd --uid 1001 --gid fever --shell /usr/sbin/nologin --no-create-home fever

WORKDIR /app

# Install pre-built wheels from builder stage — fast, no compiler in final image
COPY --from=builder /build/wheels /wheels
COPY app/requirements.txt .
RUN pip install --no-cache-dir --no-index --find-links=/wheels -r requirements.txt \
    && rm -rf /wheels

# Copy application code last for optimal layer caching (code changes most often)
COPY app/ /app/app/

# Drop privileges — never run as root
USER 1001

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/home/fever/.local/bin:${PATH}"

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://127.0.0.1:8000/health/live || exit 1

# uvloop event loop for high-throughput async I/O
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--loop", "uvloop", "--http", "httptools", "--proxy-headers"]
