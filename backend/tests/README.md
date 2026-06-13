# Running the test suite

## Prerequisites

1. **Python 3.12** installed locally
2. **PostgreSQL running** with a `crib_test` database:
   ```sql
   CREATE DATABASE crib_test;
   ```
   The easiest way is to spin up just the postgres service:
   ```bash
   docker compose -f docker-compose.local.yml up postgres -d
   ```

3. **Local venv** set up in `backend/`:
   ```bash
   cd backend
   python -m venv .venv
   source .venv/Scripts/activate   # Windows (Git Bash)
   # source .venv/bin/activate      # Mac / Linux
   pip install -e ".[dev]"
   ```

4. Copy `.env.test` and adjust credentials to match your local postgres password:
   ```bash
   # DATABASE_URL and REDIS_URL in .env.test must match your local services
   ```

## Run all tests

```bash
cd backend
pytest
```

## Run with coverage

```bash
pytest --cov=app --cov-report=term-missing
```

## Run a single file

```bash
pytest tests/test_health.py -v
pytest tests/test_auth.py -v
```

## What each test file covers

| File | Tests |
|------|-------|
| `test_health.py` | Liveness + readiness probes, Redis-down degraded state |
| `test_auth.py` | Dev bypass, missing/bad token → 401, profile creation + dedup |
| `test_me.py` | GET/PATCH /me, GDPR consent endpoint |
| `test_organisations.py` | Provision org, duplicate conflict, dev-mode Logto skip |

## Notes

- Redis is **mocked** (fakeredis-style AsyncMock) — no Redis required for tests
- Logto JWKS calls are **never made** — dev bypass (`X-Dev-User-Id`) is used
- Each test runs inside a **rolled-back transaction** — no cleanup needed between tests
- The `crib_test` schema is created fresh at session start and dropped at the end
