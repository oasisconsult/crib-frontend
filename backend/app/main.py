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
from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.core.redis import close_redis, get_redis

settings = get_settings()
configure_logging(debug=settings.is_debug)

log = structlog.get_logger(__name__)


# ── Pure-ASGI request-ID middleware (avoids BaseHTTPMiddleware task leak) ─────

class RequestIdMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        import uuid

        headers = dict(scope.get("headers", []))
        request_id = (
            headers.get(b"x-request-id", b"").decode() or str(uuid.uuid4())
        )
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)

        async def send_with_id(message: dict) -> None:
            if message["type"] == "http.response.start":
                raw = list(message.get("headers", []))
                raw.append((b"x-request-id", request_id.encode()))
                message = {**message, "headers": raw}
            await send(message)

        await self.app(scope, receive, send_with_id)


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    log.info("crib.startup", environment=settings.environment, debug=settings.is_debug)

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
    application.add_middleware(RequestIdMiddleware)

    # ── Exception handlers ────────────────────────────────────────────────────
    @application.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled_exception", path=request.url.path, exc=str(exc))
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"errors": [{"code": "internal_error", "message": "An unexpected error occurred"}]},
        )

    # ── Routers ───────────────────────────────────────────────────────────────
    from app.api.v1 import (
        agency_invites, analytics, health, inspections, landlords, leases, me, messages,
        mobile_money, notifications, onboarding, organisations, payments, properties,
        property_import, rbac, system_settings, tenant_import, tenants, uploads, wallet, webhooks,
    )
    from app.api.v1.flat_payments import (
        late_fees_router, payments_router, schedules_router,
    )

    application.include_router(health.router)
    application.include_router(me.router, prefix=settings.api_prefix)
    application.include_router(organisations.router, prefix=settings.api_prefix)
    application.include_router(properties.router, prefix=settings.api_prefix)
    application.include_router(tenants.router, prefix=settings.api_prefix)
    # Onboarding payment flow — must be registered BEFORE tenants router catch-all
    # but uses the same /tenants/onboarding/{token}/... prefix so order matters.
    # FastAPI matches routes in registration order; the more-specific onboarding
    # routes are registered here, before any catch-all tenant routes.
    application.include_router(onboarding.router, prefix=settings.api_prefix)
    application.include_router(leases.router, prefix=settings.api_prefix)
    application.include_router(messages.router, prefix=settings.api_prefix)
    application.include_router(messages.flat_router, prefix=settings.api_prefix)
    application.include_router(payments.router, prefix=settings.api_prefix)
    # Flat (org-level) payment endpoints
    application.include_router(payments_router, prefix=settings.api_prefix)
    application.include_router(schedules_router, prefix=settings.api_prefix)
    application.include_router(late_fees_router, prefix=settings.api_prefix)
    application.include_router(inspections.router, prefix=settings.api_prefix)
    application.include_router(analytics.router, prefix=settings.api_prefix)
    application.include_router(notifications.router, prefix=settings.api_prefix)
    application.include_router(system_settings.router, prefix=settings.api_prefix)
    application.include_router(rbac.router, prefix=settings.api_prefix)
    application.include_router(uploads.router, prefix=settings.api_prefix)
    application.include_router(wallet.router, prefix=settings.api_prefix)
    application.include_router(mobile_money.router, prefix=settings.api_prefix)
    # Webhooks use the api_prefix but no auth — called by external providers
    application.include_router(property_import.router, prefix=settings.api_prefix)
    application.include_router(tenant_import.router, prefix=settings.api_prefix)
    application.include_router(landlords.router, prefix=settings.api_prefix)
    application.include_router(agency_invites.router, prefix=settings.api_prefix)
    application.include_router(webhooks.router, prefix=settings.api_prefix)

    return application


app = create_app()
