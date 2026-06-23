"""
RBAC admin service — role and permission CRUD via the shared RBAC database.

Provides:
  - get_role_service()          FastAPI dependency yielding a RoleService scoped
                                to the "crib" app. Commits on success, rolls back
                                on error.
  - get_role_priority_map()     Role-name → priority int, from shared RBAC DB with
                                5-min in-process TTL. Used by deps._primary_role().
  - is_valid_crib_role()        Quick role name check against shared RBAC DB.
  - list_resources_rbac()       Resources + permission IDs for the admin UI.
  - permission_detail_rbac()    Permission list for a specific role (with resource
                                names joined in — RoleService.list_role_permissions
                                does not eager-load the resource relationship).

All functions silently degrade when RBAC_DATABASE_URL is not set (local dev).
"""
from __future__ import annotations

import time
from typing import AsyncIterator
from uuid import UUID

import structlog
from fastapi import Depends, HTTPException, status
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from rbac.models.role import Permission, Resource, Role, RolePermission
from rbac.services.role_service import RoleService

from app.core.redis import get_redis

log = structlog.get_logger(__name__)

# ── Shared RBAC DB connection (reuses rbac_user_service engine/pool) ──────────

_FALLBACK_PRIORITY: dict[str, int] = {
    "superadmin":  0,
    "owner":      10,
    "caretaker":  15,
    "manager":    20,
    "landlord":   25,
    "maintenance": 30,
    "tenant":     40,
}

# Stable per-process caches (seeded values never change)
_crib_app_id: UUID | None = None
_role_priority_cache: dict[str, int] = {}
_role_priority_cache_at: float = 0.0


def _get_factory():
    """Reuse the lazy RBAC DB session factory from rbac_user_service."""
    from app.services.rbac_user_service import get_rbac_factory
    return get_rbac_factory()


async def _resolve_app_id(session: AsyncSession) -> UUID:
    global _crib_app_id
    if _crib_app_id is not None:
        return _crib_app_id
    row = await session.scalar(text("SELECT id FROM rbac_apps WHERE slug = 'crib'"))
    if row is None:
        raise RuntimeError("'crib' not found in rbac_apps — run bootstrap")
    _crib_app_id = UUID(str(row))
    return _crib_app_id


# ── FastAPI dependency ────────────────────────────────────────────────────────


async def get_role_service() -> AsyncIterator[RoleService]:
    """
    Yield a RoleService scoped to the crib app, with auto-commit/rollback.

    Raises HTTP 503 when RBAC_DATABASE_URL is not configured.
    """
    factory = _get_factory()
    if factory is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="RBAC service unavailable — RBAC_DATABASE_URL not configured",
        )
    async with factory() as session:
        async with session.begin():
            app_id = await _resolve_app_id(session)
            yield RoleService(db=session, redis=get_redis(), app_id=app_id)


# ── Shared helpers (used by rbac.py endpoints) ────────────────────────────────


async def permission_detail_rbac(
    session: AsyncSession, role_id: UUID
) -> list[tuple[str, str, str]]:
    """
    Return (resource_name, action, permission_id_str) tuples for a role.
    Joins Permission → Resource so resource names are included in one query.
    """
    result = await session.execute(
        select(Resource.name, Permission.action, Permission.id)
        .join(Permission, Permission.resource_id == Resource.id)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .where(RolePermission.role_id == role_id)
        .order_by(Resource.name, Permission.action)
    )
    return [(row.name, row.action, str(row.id)) for row in result]


async def list_resources_rbac(
    session: AsyncSession, app_id: UUID
) -> list[dict]:
    """Return resources with their permission IDs for the admin UI."""
    result = await session.execute(
        select(Resource.id, Resource.name, Permission.id.label("perm_id"), Permission.action)
        .join(Permission, Permission.resource_id == Resource.id)
        .where(Resource.app_id == app_id)
        .order_by(Resource.name, Permission.action)
    )
    resources: dict[str, dict] = {}
    for row in result:
        r_id = str(row.id)
        if r_id not in resources:
            resources[r_id] = {"id": r_id, "name": row.name, "permissions": []}
        resources[r_id]["permissions"].append({"id": str(row.perm_id), "action": row.action})
    return list(resources.values())


# ── Role priority map (used by deps._primary_role) ───────────────────────────


async def get_role_priority_map() -> dict[str, int]:
    """
    Return role-name → priority int from the shared RBAC DB, with 5-min TTL.
    Falls back to the hardcoded map when RBAC_DATABASE_URL is not configured.
    """
    global _role_priority_cache, _role_priority_cache_at

    now = time.monotonic()
    if _role_priority_cache and (now - _role_priority_cache_at) < 300.0:
        return _role_priority_cache

    factory = _get_factory()
    if factory is None:
        return dict(_FALLBACK_PRIORITY)

    try:
        async with factory() as session:
            app_id = await _resolve_app_id(session)
            rows = await session.execute(
                text(
                    "SELECT name, priority FROM rbac_roles "
                    "WHERE app_id = :app_id AND is_active = TRUE ORDER BY priority"
                ),
                {"app_id": str(app_id)},
            )
            _role_priority_cache = {row.name: row.priority for row in rows}
            _role_priority_cache_at = now
            return _role_priority_cache
    except Exception as exc:
        log.warning("rbac_admin.priority_map_failed", error=str(exc))
        return _role_priority_cache if _role_priority_cache else dict(_FALLBACK_PRIORITY)


def invalidate_priority_cache() -> None:
    global _role_priority_cache_at
    _role_priority_cache_at = 0.0


# ── Role name validation (used by admin_user_roles.py) ───────────────────────


async def is_valid_crib_role(role_name: str) -> bool:
    """Return True if role_name exists in the shared RBAC DB for the crib app."""
    factory = _get_factory()
    if factory is None:
        # Fallback: check static list
        return role_name in _FALLBACK_PRIORITY

    try:
        async with factory() as session:
            app_id = await _resolve_app_id(session)
            exists = await session.scalar(
                text(
                    "SELECT 1 FROM rbac_roles "
                    "WHERE app_id = :app_id AND name = :name AND is_active = TRUE"
                ),
                {"app_id": str(app_id), "name": role_name},
            )
            return exists is not None
    except Exception as exc:
        log.warning("rbac_admin.is_valid_role_failed", role=role_name, error=str(exc))
        return role_name in _FALLBACK_PRIORITY


async def list_role_names_ordered() -> list[str]:
    """Return all active crib role names in priority order (for admin UI dropdowns)."""
    factory = _get_factory()
    if factory is None:
        return sorted(_FALLBACK_PRIORITY, key=lambda r: _FALLBACK_PRIORITY[r])

    try:
        async with factory() as session:
            app_id = await _resolve_app_id(session)
            rows = await session.execute(
                text(
                    "SELECT name FROM rbac_roles "
                    "WHERE app_id = :app_id AND is_active = TRUE ORDER BY priority"
                ),
                {"app_id": str(app_id)},
            )
            return [row.name for row in rows]
    except Exception as exc:
        log.warning("rbac_admin.list_role_names_failed", error=str(exc))
        return sorted(_FALLBACK_PRIORITY, key=lambda r: _FALLBACK_PRIORITY[r])
