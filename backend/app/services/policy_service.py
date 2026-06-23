"""
Policy engine — the single source of truth for authorization decisions.

Design
------
The engine answers one question: "Can a user with *these roles* perform
*action* on *resource*?"

Primary path (staging / production):
    AppContextMiddleware resolves the user's permissions from the shared RBAC
    database on every request and attaches them to request.state.rbac.permissions
    as a set[str] of "resource:action" strings (e.g. "property:create").
    PolicyService reads this set directly — zero additional DB round-trips,
    backed by a Redis cache with a 10-minute TTL per role.

Fallback path (local dev without RBAC_DATABASE_URL):
    When request.state.rbac is absent (middleware not registered), PolicyService
    falls back to the local role_permissions table with a 5-minute in-process
    TTL cache.  This keeps local development working without the shared RBAC DB.

Usage in route files
--------------------
Replace:
    _read = Depends(require_org_access(...))

With:
    _read = Depends(require_permission("read", "property"))

Or perform a soft check inside a handler:
    policy = PolicyService(request)
    if await policy.can(current_user.roles, "delete", "payment", db):
        ...
"""

from __future__ import annotations

import time

from fastapi import Depends, HTTPException, Request, status
from fastapi.params import Depends as DependsType
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.rbac import Permission, RoleModel, RolePermission, Resource


# ── Local-DB fallback cache ───────────────────────────────────────────────────
# Only used when RBAC_DATABASE_URL is not set (local dev / CI without shared DB).
# Maps role_name → frozenset of "resource:action" strings.

_perm_cache: dict[str, tuple[float, frozenset[str]]] = {}
_PERM_TTL = 300.0  # seconds


def invalidate_role_cache(role_name: str | None = None) -> None:
    """Evict cached permissions (local-DB fallback cache only)."""
    if role_name is None:
        _perm_cache.clear()
    else:
        _perm_cache.pop(role_name, None)


async def _load_local_role_permissions(
    role_name: str, db: AsyncSession
) -> frozenset[str]:
    """Load role → permission set from the local DB with TTL cache."""
    now = time.monotonic()
    cached = _perm_cache.get(role_name)
    if cached and (now - cached[0]) < _PERM_TTL:
        return cached[1]

    result = await db.execute(
        select(Resource.name, Permission.action)
        .join(Permission, Permission.resource_id == Resource.id)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .join(RoleModel, RoleModel.id == RolePermission.role_id)
        .where(RoleModel.name == role_name)
    )
    perms: frozenset[str] = frozenset(
        f"{row.name}:{row.action}" for row in result
    )
    _perm_cache[role_name] = (now, perms)
    return perms


# ── Core service ──────────────────────────────────────────────────────────────


class PolicyService:
    """
    Stateless service — instantiated per-request via FastAPI DI.

    Reads permissions from request.state.rbac.permissions (shared RBAC DB,
    already resolved and Redis-cached by AppContextMiddleware) when available.
    Falls back to local DB queries when the middleware is absent.
    """

    def __init__(self, request: Request) -> None:
        ctx = getattr(request.state, "rbac", None)
        # Primary: pre-resolved permission set from shared RBAC DB
        self._rbac_permissions: frozenset[str] | None = (
            frozenset(ctx.permissions) if (ctx and ctx.permissions) else None
        )

    async def can(
        self,
        roles: list[str],
        action: str,
        resource: str,
        db: AsyncSession,
    ) -> bool:
        """Return True if ANY of the given roles grants `action` on `resource`."""
        if "superadmin" in roles:
            return True

        key = f"{resource}:{action}"

        # Primary path — shared RBAC DB permissions (set by middleware)
        if self._rbac_permissions is not None:
            return key in self._rbac_permissions

        # Fallback — local DB (dev without RBAC_DATABASE_URL)
        for role in roles:
            perms = await _load_local_role_permissions(role, db)
            if key in perms:
                return True
        return False

    async def enforce(
        self,
        roles: list[str],
        action: str,
        resource: str,
        db: AsyncSession,
    ) -> None:
        """Raise HTTP 403 if the user is not permitted."""
        if not await self.can(roles, action, resource, db):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: {action} on {resource}",
            )


# ── FastAPI dependency ────────────────────────────────────────────────────────


def get_policy_service(request: Request) -> PolicyService:
    return PolicyService(request)


def require_permission(action: str, resource: str) -> DependsType:
    """
    FastAPI dependency factory.  Ensures the current user has `action` on
    `resource` according to the DB-driven policy engine.

    Example:
        router.get("/properties", dependencies=[require_permission("read", "property")])
    """
    from app.api.deps import CurrentUser, get_current_user

    async def _guard(
        request: Request,
        current_user: CurrentUser = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
        policy: PolicyService = Depends(get_policy_service),
    ) -> CurrentUser:
        await policy.enforce(current_user.roles, action, resource, db)
        return current_user

    _guard.__name__ = f"require_{action}_{resource}"
    return Depends(_guard)
