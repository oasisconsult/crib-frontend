"""
RBAC user provisioning service.

Writes user → role assignments to the shared RBAC database during Crib
onboarding flows so that the AppContextMiddleware (Phase 4) resolves the
correct Crib role from the RBAC DB rather than falling back to the shared
Logto JWT, which auto-assigns GeoBox's "resident" role to every new signup.

All functions open their own RBAC DB session and commit independently of
the Crib application DB session.  Failures are swallowed and logged —
RBAC provisioning is best-effort.  The Phase 1 fix in deps._upsert_profile
ensures foreign roles from the RBAC DB cannot overwrite a correctly-set
onboarding role even if this service temporarily fails.
"""
from __future__ import annotations

import structlog

log = structlog.get_logger(__name__)

# ── Lazy singletons ────────────────────────────────────────────────────────────
# Engine and factory are created once per process on first use and then reused.

_rbac_engine = None
_rbac_factory = None

# Stable lookup cache — app_id and role IDs never change after bootstrap.
_crib_app_id: str | None = None
_crib_role_map: dict[str, str] = {}   # role_name → role_id UUID string


def get_rbac_factory():
    """Public accessor for the lazy RBAC DB session factory (shared with rbac_admin_service)."""
    return _get_factory()


def _get_factory():
    """Return a lazily-created RBAC async session factory, or None if unconfigured."""
    global _rbac_engine, _rbac_factory
    if _rbac_factory is not None:
        return _rbac_factory

    from app.core.config import get_settings
    from sqlalchemy.engine.url import make_url
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

    settings = get_settings()
    if not settings.rbac_database_url:
        return None

    _rbac_engine = create_async_engine(
        make_url(settings.rbac_database_url),
        pool_size=2,
        max_overflow=2,
        future=True,
    )
    _rbac_factory = async_sessionmaker(
        _rbac_engine, expire_on_commit=False, class_=AsyncSession
    )
    return _rbac_factory


async def provision_crib_role(
    logto_sub: str,
    email: str | None,
    role_name: str,
) -> None:
    """
    Upsert the user into rbac_platform_users and assign them the given Crib
    role in rbac_user_roles.

    Silently no-ops when RBAC_DATABASE_URL is not configured (dev/local).
    Logs a warning but does NOT raise on failure — an RBAC DB outage must
    never block an onboarding completion.

    Args:
        logto_sub:  The Logto user ID (sub claim), e.g. "user_abc123".
        email:      User email for the platform_users record (optional).
        role_name:  Crib role name, e.g. "owner", "landlord", "manager",
                    "caretaker", "tenant".
    """
    if not logto_sub or logto_sub.startswith(("pending_", "user_pending_")):
        # Placeholder sub from a failed Logto call — nothing to write
        log.debug("rbac.provision_skipped_placeholder_sub", logto_sub=logto_sub, role=role_name)
        return

    factory = _get_factory()
    if factory is None:
        return  # RBAC DB not configured — no-op

    try:
        await _do_provision(factory, logto_sub, email, role_name)
        log.info("rbac.role_provisioned", logto_sub=logto_sub[:12], role=role_name)
    except Exception as exc:
        log.warning(
            "rbac.provision_role_failed",
            logto_sub=logto_sub[:12],
            role=role_name,
            error=str(exc),
        )


async def revoke_crib_role(logto_sub: str, role_name: str) -> None:
    """
    Deactivate (soft-delete) a Crib role assignment in the RBAC DB.

    Silently no-ops when RBAC_DATABASE_URL is not configured.
    Logs a warning but does NOT raise on failure.
    """
    if not logto_sub or logto_sub.startswith(("pending_", "user_pending_")):
        return

    factory = _get_factory()
    if factory is None:
        return

    try:
        await _do_revoke(factory, logto_sub, role_name)
        log.info("rbac.role_revoked", logto_sub=logto_sub[:12], role=role_name)
    except Exception as exc:
        log.warning(
            "rbac.revoke_role_failed",
            logto_sub=logto_sub[:12],
            role=role_name,
            error=str(exc),
        )


async def get_user_crib_roles(logto_sub: str) -> list[dict]:
    """
    Return the active Crib role assignments for a user from the RBAC DB.

    Each dict has keys: role_name, is_active, assigned_at (ISO string or None).
    Returns [] when RBAC_DATABASE_URL is not configured or on any error.
    """
    if not logto_sub:
        return []

    factory = _get_factory()
    if factory is None:
        return []

    try:
        return await _do_get_roles(factory, logto_sub)
    except Exception as exc:
        log.warning("rbac.get_roles_failed", logto_sub=logto_sub[:12], error=str(exc))
        return []


async def _do_revoke(factory, logto_sub: str, role_name: str) -> None:
    """Deactivate a single role assignment in the RBAC DB."""
    global _crib_app_id, _crib_role_map
    from sqlalchemy import text

    async with factory() as session:
        if _crib_app_id is None:
            app_id = await session.scalar(text("SELECT id FROM rbac_apps WHERE slug = 'crib'"))
            if app_id is None:
                raise RuntimeError("'crib' not found in rbac_apps")
            _crib_app_id = str(app_id)

        if role_name not in _crib_role_map:
            role_id_val = await session.scalar(
                text("SELECT id FROM rbac_roles WHERE app_id = :app_id AND name = :name"),
                {"app_id": _crib_app_id, "name": role_name},
            )
            if role_id_val is None:
                return  # role doesn't exist — nothing to revoke
            _crib_role_map[role_name] = str(role_id_val)

        role_id = _crib_role_map[role_name]

        user_id = await session.scalar(
            text("SELECT id FROM rbac_platform_users WHERE logto_sub = :sub"),
            {"sub": logto_sub},
        )
        if user_id is None:
            return  # user not in RBAC DB — nothing to revoke

        await session.execute(
            text("""
                UPDATE rbac_user_roles SET is_active = FALSE
                WHERE user_id = :user_id
                  AND role_id = :role_id
                  AND app_id  = :app_id
            """),
            {"user_id": str(user_id), "role_id": role_id, "app_id": _crib_app_id},
        )
        await session.commit()


async def _do_get_roles(factory, logto_sub: str) -> list[dict]:
    """Fetch all active Crib role assignments for a user from the RBAC DB."""
    global _crib_app_id
    from sqlalchemy import text

    async with factory() as session:
        if _crib_app_id is None:
            app_id = await session.scalar(text("SELECT id FROM rbac_apps WHERE slug = 'crib'"))
            if app_id is None:
                return []
            _crib_app_id = str(app_id)

        rows = await session.execute(
            text("""
                SELECT r.name, ur.is_active, ur.assigned_at
                FROM rbac_user_roles ur
                JOIN rbac_roles r ON r.id = ur.role_id
                JOIN rbac_platform_users pu ON pu.id = ur.user_id
                WHERE pu.logto_sub = :sub
                  AND ur.app_id    = :app_id
                ORDER BY ur.assigned_at DESC
            """),
            {"sub": logto_sub, "app_id": _crib_app_id},
        )
        return [
            {
                "role_name": row.name,
                "is_active": row.is_active,
                "assigned_at": row.assigned_at.isoformat() if row.assigned_at else None,
            }
            for row in rows
        ]


async def _do_provision(factory, logto_sub: str, email: str | None, role_name: str) -> None:
    """Inner writer — resolves IDs and writes to the RBAC DB in one session."""
    global _crib_app_id, _crib_role_map
    from sqlalchemy import text

    async with factory() as session:
        # Resolve Crib app_id (stable after bootstrap; cached for process lifetime)
        if _crib_app_id is None:
            app_id = await session.scalar(
                text("SELECT id FROM rbac_apps WHERE slug = 'crib'")
            )
            if app_id is None:
                raise RuntimeError(
                    "'crib' not found in rbac_apps — run bootstrap first or ensure RBAC_DATABASE_URL is correct"
                )
            _crib_app_id = str(app_id)

        # Resolve role_id for this role name within the Crib app (stable; cached)
        if role_name not in _crib_role_map:
            role_id_val = await session.scalar(
                text("SELECT id FROM rbac_roles WHERE app_id = :app_id AND name = :name"),
                {"app_id": _crib_app_id, "name": role_name},
            )
            if role_id_val is None:
                raise RuntimeError(
                    f"Role '{role_name}' not found in rbac_roles for Crib app "
                    f"(app_id={_crib_app_id}) — check RBAC DB seed"
                )
            _crib_role_map[role_name] = str(role_id_val)

        role_id = _crib_role_map[role_name]

        # Upsert rbac_platform_users — thin identity record keyed on logto_sub
        await session.execute(
            text("""
                INSERT INTO rbac_platform_users (logto_sub, email)
                VALUES (:sub, :email)
                ON CONFLICT (logto_sub) DO UPDATE SET email = EXCLUDED.email
            """),
            {"sub": logto_sub, "email": email},
        )
        user_id_row = await session.execute(
            text("SELECT id FROM rbac_platform_users WHERE logto_sub = :sub"),
            {"sub": logto_sub},
        )
        user_id = str(user_id_row.scalar_one())

        # Insert into rbac_user_roles if not already present.
        # A SELECT-then-INSERT is used instead of ON CONFLICT because org_id=NULL
        # prevents a clean ON CONFLICT on the (user_id, role_id, app_id, org_id)
        # unique constraint (NULL != NULL in Postgres unique indexes).
        existing = await session.scalar(
            text("""
                SELECT 1 FROM rbac_user_roles
                WHERE user_id = :user_id
                  AND role_id = :role_id
                  AND app_id  = :app_id
            """),
            {"user_id": user_id, "role_id": role_id, "app_id": _crib_app_id},
        )
        if not existing:
            await session.execute(
                text("""
                    INSERT INTO rbac_user_roles (user_id, role_id, app_id, org_id, is_active)
                    VALUES (:user_id, :role_id, :app_id, NULL, TRUE)
                """),
                {"user_id": user_id, "role_id": role_id, "app_id": _crib_app_id},
            )
        else:
            # Re-activate in case a previous admin revoke set is_active=False
            await session.execute(
                text("""
                    UPDATE rbac_user_roles SET is_active = TRUE
                    WHERE user_id = :user_id
                      AND role_id = :role_id
                      AND app_id  = :app_id
                """),
                {"user_id": user_id, "role_id": role_id, "app_id": _crib_app_id},
            )

        await session.commit()
