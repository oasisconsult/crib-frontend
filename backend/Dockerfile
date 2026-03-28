FROM python:3.12-slim AS base

WORKDIR /app

# System deps for WeasyPrint + asyncpg
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    libffi-dev \
    libcairo2 \
    && rm -rf /var/lib/apt/lists/*

# ─── Build stage ──────────────────────────────────────────────────────────────
FROM base AS builder
COPY pyproject.toml .
RUN pip install --no-cache-dir hatchling && pip install --no-cache-dir .

# ─── Production stage ─────────────────────────────────────────────────────────
FROM base AS production
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
