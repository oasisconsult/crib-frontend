# =============================================================================
# Crib Backend — Production Dockerfile (Poetry)
# =============================================================================
FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    POETRY_VERSION=1.8.4 \
    POETRY_NO_INTERACTION=1 \
    POETRY_VIRTUALENVS_CREATE=false \
    POETRY_CACHE_DIR=/tmp/poetry-cache

# System deps: WeasyPrint rendering libs + git (needed for git url redirect below)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    libffi-dev \
    libcairo2 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir poetry==$POETRY_VERSION

# ── Builder: install runtime deps only ───────────────────────────────────────
FROM base AS builder

WORKDIR /app

# geobox-rbac local copy — redirected via git url.insteadOf so poetry
# never tries to authenticate against the private GitHub repo.
# vendor/ is populated by `make clone-deps` before docker compose build.
COPY vendor/geobox-rbac ./vendor/geobox-rbac
RUN git config --global \
    url."file:///app/vendor/geobox-rbac".insteadOf \
    "https://github.com/oasisconsult/geobox-rbac.git"

# GeoBox Python SDK — vendored path dependency (no git redirect needed).
COPY vendor/geobox-sdk ./vendor/geobox-sdk

# Copy manifests first — layer is cached unless deps change
COPY pyproject.toml poetry.lock* ./

# Install runtime deps (no dev extras, no project package itself)
RUN poetry install --no-root --only main && rm -rf $POETRY_CACHE_DIR

# ── Production image ──────────────────────────────────────────────────────────
FROM base AS production

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy application source (includes alembic.ini, alembic/, app/)
COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
