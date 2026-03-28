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

# ─── Build stage: install only runtime deps ───────────────────────────────────
FROM base AS builder
COPY pyproject.toml .
# Extract and install dependencies without building/installing the package itself
RUN pip install --no-cache-dir pip-tools \
    && pip install --no-cache-dir \
        fastapi==0.115.6 \
        "uvicorn[standard]==0.32.1" \
        "sqlalchemy[asyncio]==2.0.36" \
        asyncpg==0.30.0 \
        alembic==1.14.0 \
        "pydantic[email]==2.10.3" \
        pydantic-settings==2.7.0 \
        "python-jose[cryptography]==3.3.0" \
        httpx==0.28.1 \
        "redis[hiredis]==5.2.1" \
        minio==7.2.13 \
        weasyprint==62.3 \
        jinja2==3.1.5 \
        "celery[redis]==5.4.0" \
        kombu==5.4.2 \
        sendgrid==6.11.0 \
        twilio==9.3.7 \
        python-multipart==0.0.20 \
        python-dateutil==2.9.0 \
        structlog==24.4.0 \
        ulid-py==1.1.0

# ─── Production stage ─────────────────────────────────────────────────────────
FROM base AS production
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
