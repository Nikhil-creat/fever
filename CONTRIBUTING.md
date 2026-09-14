# Contributing to FEVER^

Thanks for your interest in improving FEVER^.

## Getting started
1. Fork the repo and clone your fork
2. `pip install -r app/requirements-dev.txt`
3. Copy `.env.example` to `.env` and fill in local values
4. Run tests: `pytest app/ -v`
5. Run linters: `black app/` and `flake8 app/`

## Making changes
- Keep PRs focused — one logical change per PR
- Add/update tests for any behavior change
- Update `README.md` or `docs/` if the change affects usage
- Follow the existing code style (Black-formatted, type-hinted where practical)

## Submitting
1. Push your branch and open a PR against `main`
2. CI (lint + test + build) must pass before merge
3. Describe what changed and why in the PR description

## Questions
Reach out to Nikhil Chary Sriramoju — sriramojunikhil66@gmail.com or via
[LinkedIn](https://in.linkedin.com/in/nikhil-chary-sriramoju-95041b38a).
