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
from app.core.database import get_db

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

async def _ensure_platform_org() -> None:
    """
    Idempotent startup task:
      1. Creates the platform organisation in the Crib DB (if not exists).
      2. Creates the matching Logto organisation (if M2M credentials are set).
      3. Links any superadmin profiles that have no organisation yet.
      4. Adds those superadmin users to the Logto organisation so the JWT
         carries org membership and the frontend org-gate passes.

    Runs on every startup but no-ops after the first successful run.
    """
    import httpx
    from sqlalchemy import select
    from app.core.database import AsyncSessionLocal
    from app.models.organisation import Organisation, Plan
    from app.models.profile import Profile
    from app.services.logto_service import _get_m2m_token

    ORG_SLUG = "crib-platform"

    async with AsyncSessionLocal() as db:
        try:
            # ── 1. Find or create local org ───────────────────────────────────
            org = await db.scalar(
                select(Organisation).where(Organisation.slug == ORG_SLUG)
            )

            if org is None:
                # ── 2. Create Logto org (if M2M is configured) ────────────────
                logto_org_id = f"org_{ORG_SLUG}"
                if settings.logto_m2m_app_id and settings.logto_m2m_app_secret:
                    try:
                        token = await _get_m2m_token()
                        async with httpx.AsyncClient(timeout=10) as client:
                            resp = await client.post(
                                f"{settings.logto_management_api_base}/organizations",
                                json={"name": settings.platform_org_name, "description": "Platform organisation"},
                                headers={"Authorization": f"Bearer {token}"},
                            )
                            if resp.is_success:
                                logto_org_id = resp.json()["id"]
                                log.info("platform_org.logto_created", logto_org_id=logto_org_id)
                            else:
                                log.warning("platform_org.logto_create_failed", status=resp.status_code)
                    except Exception as exc:
                        log.warning("platform_org.logto_error", error=str(exc))

                org = Organisation(
                    logto_org_id=logto_org_id,
                    name=settings.platform_org_name,
                    slug=ORG_SLUG,
                    plan=Plan.enterprise,
                    currency="UGX",
                    country="UG",
                    settings={},
                )
                db.add(org)
                await db.flush()
                log.info("platform_org.created", slug=ORG_SLUG, name=settings.platform_org_name)
            else:
                log.info("platform_org.exists", slug=ORG_SLUG)

            # ── 3. Link ALL superadmin profiles to this org (idempotent) ────────
            result = await db.execute(
                select(Profile).where(Profile.role == "superadmin")
            )
            profiles_to_link = [
                p for p in result.scalars()
                if p.organisation_id is None or str(p.organisation_id) != str(org.id)
            ]

            for profile in profiles_to_link:
                profile.organisation_id = org.id
                profile.logto_org_id = org.logto_org_id

            if profiles_to_link:
                log.info("platform_org.linked_superadmins", count=len(profiles_to_link))

            await db.commit()

            # ── 4. Add users to Logto org so JWT carries org membership ───────
            if profiles_to_link and settings.logto_m2m_app_id and settings.logto_m2m_app_secret:
                try:
                    token = await _get_m2m_token()
                    user_ids = [p.logto_sub for p in profiles_to_link if p.logto_sub]
                    async with httpx.AsyncClient(timeout=10) as client:
                        resp = await client.post(
                            f"{settings.logto_management_api_base}/organizations/{org.logto_org_id}/users",
                            json={"userIds": user_ids},
                            headers={"Authorization": f"Bearer {token}"},
                        )
                        if resp.is_success:
                            log.info("platform_org.logto_users_added", users=user_ids)
                        else:
                            log.warning("platform_org.logto_users_failed", status=resp.status_code)
                except Exception as exc:
                    log.warning("platform_org.logto_users_error", error=str(exc))

        except Exception as exc:
            log.warning("platform_org.failed", error=str(exc))


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    log.info("crib.startup", environment=settings.environment, debug=settings.is_debug)

    # RBAC app registration — seeds the "crib" row in rbac_apps so the
    # AppContextMiddleware can resolve context on every request.
    #
    # We skip migrations entirely: geobox owns and manages the RBAC schema.
    # Running alembic from Crib fails whenever geobox has applied revisions
    # that Crib's copy of geobox-rbac does not include (e.g. m2m_tiers).
    # Calling _run_seed directly is safe and idempotent (no-ops if already seeded).
    if settings.rbac_database_url:
        try:
            from rbac.bootstrap import _run_seed
            await _run_seed(settings.rbac_database_url, "crib")
            log.info("rbac.seed.complete")
        except Exception as rbac_err:
            log.warning("rbac.seed.failed", error=str(rbac_err))

    # Provision the platform organisation (idempotent — no-op if already exists)
    await _ensure_platform_org()

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
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-Id"],
    )

    # ── Request ID middleware ─────────────────────────────────────────────────
    application.add_middleware(RequestIdMiddleware)

    # ── RBAC context middleware ───────────────────────────────────────────────
    # Uses the dedicated shared RBAC database (same Postgres server as Crib).
    # Phase 1-2: shadow_mode=True — context resolved but not enforced.
    # Phase 3:   shadow_mode=True — deps.py reads request.state.rbac (dual-source).
    # Phase 4:   shadow_mode=False — DB roles authoritative; set RBAC_SHADOW_MODE=false.
    if settings.rbac_database_url:
        from rbac.middleware import context_middleware
        from rbac.middleware.context_middleware import AppContextMiddleware
        from rbac.dependencies.ownership import configure_db_dependency
        from app.core.redis import get_redis as _get_redis

        # AppContextMiddleware runs ahead of routing and 401s any request
        # without a resolvable identity, exempting only its hardcoded
        # _BYPASS_PATHS (health/metrics). The framework has no per-app
        # exemption hook, so anonymous-by-design endpoints — like the public
        # Book a Demo submission and its contact-email lookup, both meant for
        # marketing-site visitors with no Logto session — must be added to
        # that set directly.
        # backend/vendor/geobox-rbac is gitignored and re-synced from the
        # upstream repo by `make clone-deps` before every build, so this
        # cannot be patched in the vendored copy; it must live here.
        context_middleware._BYPASS_PATHS.add(f"{settings.api_prefix}/public/demo-bookings")
        context_middleware._BYPASS_PATHS.add(f"{settings.api_prefix}/public/demo-bookings/contact")

        configure_db_dependency(get_db)
        application.add_middleware(
            AppContextMiddleware,
            app_slug="crib",
            rbac_database_url=settings.rbac_database_url,
            redis_factory=_get_redis,
            internal_secret=settings.secret_key,
            shadow_mode=settings.rbac_shadow_mode,
        )
        log.info("rbac.middleware.enabled", shadow_mode=settings.rbac_shadow_mode,
                 phase="4" if not settings.rbac_shadow_mode else "1-3")
    else:
        log.warning("rbac.middleware.disabled", reason="RBAC_DATABASE_URL not set")

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
        admin,
        agency_invites, analytics, contact_info, demo_bookings, email_templates, geobox, health, inspections, landlords, leases, me,
        messages, mobile_money, notifications, onboarding, organisations, payments, properties,
        property_import, rbac, system_settings, tenant_import, tenants, uploads, wallet, webhooks,
    )
    from app.api.v1.flat_payments import (
        late_fees_router, payments_router, schedules_router,
    )

    application.include_router(health.router)
    application.include_router(me.router, prefix=settings.api_prefix)
    application.include_router(organisations.router, prefix=settings.api_prefix)
    application.include_router(properties.router, prefix=settings.api_prefix)
    application.include_router(geobox.router, prefix=settings.api_prefix)
    application.include_router(tenants.router, prefix=settings.api_prefix)
    # Onboarding payment flow — must be registered BEFORE tenants router catch-all
    # but uses the same /tenants/onboarding/{token}/... prefix so order matters.
    # FastAPI matches routes in registration order; the more-specific onboarding
    # routes are registered here, before any catch-all tenant routes.
    application.include_router(onboarding.router, prefix=settings.api_prefix)
    application.include_router(leases.router, prefix=settings.api_prefix)
    from app.features.rent_increase.router import router as rent_increase_router
    application.include_router(rent_increase_router, prefix=settings.api_prefix)
    from app.features.eviction_notice.router import router as eviction_notice_router
    application.include_router(eviction_notice_router, prefix=settings.api_prefix)
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
    application.include_router(system_settings.public_router, prefix=settings.api_prefix)
    application.include_router(email_templates.router, prefix=settings.api_prefix)
    application.include_router(rbac.router, prefix=settings.api_prefix)
    application.include_router(uploads.router, prefix=settings.api_prefix)
    application.include_router(wallet.router, prefix=settings.api_prefix)
    application.include_router(mobile_money.router, prefix=settings.api_prefix)
    # Webhooks use the api_prefix but no auth — called by external providers
    application.include_router(property_import.router, prefix=settings.api_prefix)
    application.include_router(tenant_import.router, prefix=settings.api_prefix)
    application.include_router(landlords.router, prefix=settings.api_prefix)
    application.include_router(agency_invites.router, prefix=settings.api_prefix)
    from app.api.v1 import caretaker_invites
    application.include_router(caretaker_invites.router, prefix=settings.api_prefix)
    application.include_router(admin.router, prefix=settings.api_prefix)
    application.include_router(webhooks.router, prefix=settings.api_prefix)
    # Book a Demo — public submission endpoint + superadmin management endpoints
    application.include_router(demo_bookings.public_router, prefix=settings.api_prefix)
    application.include_router(demo_bookings.router, prefix=settings.api_prefix)
    # Public contact info (support email/phone/WhatsApp) shown on the marketing site
    application.include_router(contact_info.public_router, prefix=settings.api_prefix)

    # ── Subscription & Billing ────────────────────────────────────────────────
    from app.api.v1 import subscriptions, billing_payments, invoices, admin_billing
    application.include_router(subscriptions.router, prefix=settings.api_prefix)
    application.include_router(billing_payments.router, prefix=settings.api_prefix)
    application.include_router(invoices.router, prefix=settings.api_prefix)
    application.include_router(admin_billing.router, prefix=settings.api_prefix)

    # ── EFRIS (URA Electronic Fiscal Receipting) ──────────────────────────────
    from app.api.v1 import efris
    application.include_router(efris.router, prefix=settings.api_prefix)

    # ── Contractor directory ───────────────────────────────────────────────────
    from app.api.v1 import contractors
    application.include_router(contractors.router, prefix=settings.api_prefix)

    # ── Prometheus metrics ────────────────────────────────────────────────────
    # Exposes GET /metrics for the shared Prometheus instance on geobox-network.
    # Scrape target is added in GeoBox core/config/prometheus/prometheus.yml.
    from prometheus_fastapi_instrumentator import Instrumentator
    Instrumentator(
        should_group_status_codes=True,
        should_ignore_untemplated=True,
        excluded_handlers=["/api/v1/health"],
    ).instrument(application).expose(application, include_in_schema=False)

    return application


app = create_app()
