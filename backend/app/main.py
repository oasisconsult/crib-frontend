"""
Crib FastAPI application factory.

Startup order:
  1. configure_logging()
  2. Create FastAPI app with metadata and exception handlers
  3. Mount CORS middleware
  4. Include all API routers
  5. Lifespan: verify DB connectivity on startup, close Redis pool on shutdown
"""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.core.redis import close_redis, get_redis

settings = get_settings()
configure_logging(debug=settings.debug)

log = structlog.get_logger(__name__)


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    log.info("crib.startup", environment=settings.environment, debug=settings.debug)

    # Verify Redis is reachable
    try:
        redis = get_redis()
        await redis.ping()
        log.info("redis.connected")
    except Exception as exc:
        log.warning("redis.unavailable", error=str(exc))

    yield

    await close_redis()
    log.info("crib.shutdown")


# ── App factory ───────────────────────────────────────────────────────────────

def create_app() -> FastAPI:
    application = FastAPI(
        title="Crib API",
        description="Property management platform — REST API",
        version="0.1.0",
        docs_url="/docs" if settings.is_dev else None,
        redoc_url="/redoc" if settings.is_dev else None,
        openapi_url="/openapi.json" if settings.is_dev else None,
        lifespan=lifespan,
    )

    # ── CORS ──────────────────────────────────────────────────────────────────
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-Id"],
    )

    # ── Request ID middleware ─────────────────────────────────────────────────
    @application.middleware("http")
    async def request_id_middleware(request: Request, call_next):
        import uuid
        request_id = request.headers.get("X-Request-Id", str(uuid.uuid4()))
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)
        response = await call_next(request)
        response.headers["X-Request-Id"] = request_id
        return response

    # ── Exception handlers ────────────────────────────────────────────────────
    @application.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled_exception", path=request.url.path, exc=str(exc))
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"errors": [{"code": "internal_error", "message": "An unexpected error occurred"}]},
        )

    # ── Routers ───────────────────────────────────────────────────────────────
    from app.api.v1 import health, me, organisations

    application.include_router(health.router)
    application.include_router(me.router, prefix=settings.api_prefix)
    application.include_router(organisations.router, prefix=settings.api_prefix)

    return application


app = create_app()
