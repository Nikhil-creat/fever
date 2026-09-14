# FEVER^ — High-Throughput Resume Matching Engine

[![CI/CD](https://github.com/Nikhil-creat/fever/actions/workflows/deploy.yml/badge.svg)](https://github.com/Nikhil-creat/fever/actions/workflows/deploy.yml)
[![Deploy Pages](https://github.com/Nikhil-creat/fever/actions/workflows/pages.yml/badge.svg)](https://github.com/Nikhil-creat/fever/actions/workflows/pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python 3.12](https://img.shields.io/badge/python-3.12-blue.svg)](app/requirements.txt)

**Live demo:** https://nikhil-creat.github.io/fever/

A production-ready, cloud-native infrastructure stack: FastAPI + Redis async backend,
Kubernetes/Helm deployment, autoscaling, load testing, CI/CD, and full observability
(Prometheus/Grafana/Alertmanager).

## Architecture Components

| Component | Path | Purpose |
|---|---|---|
| Application | `app/main.py` | Async FastAPI service, Redis pooling, Prometheus metrics, K8s health probes |
| Container | `Dockerfile` | Multi-stage, hardened, non-root (UID 1001) runtime image |
| Deployment | `helm/fever/` | Helm chart — Deployment, Service, Ingress, HPA, PDB |
| Load Testing | `loadtest/locustfile.py` | Locust suite with synthetic payloads + step-ramp/spike traffic shape |
| CI/CD | `.github/workflows/deploy.yml` | Lint → Test → Build/Push (GHCR) → Helm deploy with auto-rollback |
| Observability | `observability/` | Grafana dashboard, Prometheus alert rules, Alertmanager routing |
| Static site | `docs/` | GitHub Pages showcase + live demo, SEO/OG meta, PWA manifest, robots.txt, sitemap.xml, custom 404 |
| Repo hygiene | `.gitignore`, `.dockerignore`, `.env.example`, `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md` | Standard launch-readiness files for public repos |

## Quick Start

```bash
# Local run
docker build -t fever:local .
docker run -p 8000:8000 -e REDIS_URL=redis://host.docker.internal:6379 fever:local

# Deploy to Kubernetes
helm upgrade --install fever helm/fever \
  -n fever-prod --create-namespace \
  --set image.tag=local

# Load test
locust -f loadtest/locustfile.py --host https://fever.example.com
```

## GitHub Pages (static showcase + live demo)

GitHub Pages only serves static files — it cannot run the FastAPI/Redis backend,
Docker, or Kubernetes directly. To make this repo Pages-ready, a static site lives
in `docs/`:

- `docs/index.html` — project showcase, architecture overview, and a live demo form
- `docs/assets/demo.js` — demo logic: calls your real backend if a URL is provided,
  otherwise falls back to an in-browser JS mock of the same scoring algorithm
- `.github/workflows/pages.yml` — auto-deploys `docs/` to GitHub Pages on every push to `main`

### Enable it
1. Repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**
2. Push to `main` — the `pages.yml` workflow builds and publishes automatically
3. Site goes live at `https://<username>.github.io/<repo>/`

### Wiring the live demo to a real backend
1. Deploy `app/` + `Dockerfile` somewhere that runs containers (Render, Railway,
   Fly.io, EC2, or the included Helm chart on any Kubernetes cluster)
2. Set `CORS_ALLOWED_ORIGINS=https://<username>.github.io` as an env var on that backend
   (defaults to `*` for convenience — lock it down in production)
3. Paste the backend's public URL into the "Backend URL" field on the demo page
4. Requests hit `/api/v1/match` for real; if unreachable, the page gracefully falls
   back to local mock scoring so the demo never breaks

## Configuration Notes

Before deploying to a real cluster, replace these placeholders:
- `helm/fever/values.yaml` — `ingress.hosts`, image repository
- `observability/alertmanager.yml` — Slack webhook URL, PagerDuty routing key
- `.github/workflows/deploy.yml` — repo secrets `KUBE_CONFIG_BASE64`

---

## Author

Designed and Developed by **NIKHIL CHARY SRIRAMOJU**

- GitHub: [github.com/Nikhil-creat](https://github.com/Nikhil-creat)
- LinkedIn: [in.linkedin.com/in/nikhil-chary-sriramoju-95041b38a](https://in.linkedin.com/in/nikhil-chary-sriramoju-95041b38a)
- Email: sriramojunikhil66@gmail.com

