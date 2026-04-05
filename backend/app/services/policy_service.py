"""
Policy engine — the single source of truth for authorization decisions.

Design
------
The engine answers one question: "Can a user with *these roles* perform
*action* on *resource*?"

It loads role→permission assignments from the `role_permissions` table and
caches them per-role in an in-process TTLCache (5-minute TTL).  When an admin
modifies role permissions through the admin API, `invalidate_role_cache(role)`
is called to force a re-read on the next request.

Usage in route files
--------------------
Replace:
    _read = Depends(require_org_access(...))

With:
    _read = Depends(require_permission("read", "property"))

Or perform a soft check inside a handler:
    policy = PolicyService()
    if await policy.can(current_user.roles, "delete", "payment", db):
        ...

Roles
-----
Roles are plain strings (no enum).  The `roles` table is the authoritative
list.  Unknown role names (not in the DB) simply match no permissions and are
effectively denied.
"""

from __future__ import annotations

import time
from typing import Callable

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.rbac import Permission, RoleModel, RolePermission, Resource


# ── Per-role permission cache ─────────────────────────────────────────────────
# Maps role_name → frozenset of "resource:action" strings.
# Populated lazily; invalidated explicitly by the admin RBAC API.

_perm_cache: dict[str, tuple[float, frozenset[str]]] = {}
_PERM_TTL = 300.0  # seconds


def invalidate_role_cache(role_name: str | None = None) -> None:
    """
    Evict cached permissions.
    Pass a role name to evict just that role, or None to flush everything.
    """
    if role_name is None:
        _perm_cache.clear()
    else:
        _perm_cache.pop(role_name, None)


# ── Core service ──────────────────────────────────────────────────────────────


class PolicyService:
    """Stateless service — instantiated per-request via FastAPI DI."""

    async def _load_role_permissions(
        self, role_name: str, db: AsyncSession
    ) -> frozenset[str]:
        """
        Return the set of "resource:action" strings for a role, using TTL cache.
        Returns an empty frozenset for unknown roles (no permissions granted).
        """
        now = time.monotonic()
        cached = _perm_cache.get(role_name)
        if cached and (now - cached[0]) < _PERM_TTL:
            return cached[1]

        # Load from DB: join role_permissions → permissions → resources
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

    async def can(
        self,
        roles: list[str],
        action: str,
        resource: str,
        db: AsyncSession,
    ) -> bool:
        """
        Return True if ANY of the given roles grants `action` on `resource`.

        Superadmin always wins — no DB lookup needed.
        """
        if "superadmin" in roles:
            return True

        key = f"{resource}:{action}"
        for role in roles:
            perms = await self._load_role_permissions(role, db)
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


async def get_policy_service() -> PolicyService:
    return PolicyService()


def require_permission(action: str, resource: str) -> Callable:
    """
    FastAPI dependency factory.  Ensures the current user has `action` on
    `resource` according to the DB-driven policy engine.

    Example:
        router.get("/properties", dependencies=[require_permission("read", "property")])
        # or as a typed dep:
        _read = Depends(require_permission("read", "property"))
    """
    from app.api.deps import CurrentUser, get_current_user

    async def _guard(
        current_user: CurrentUser = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
        policy: PolicyService = Depends(get_policy_service),
    ) -> CurrentUser:
        await policy.enforce(current_user.roles, action, resource, db)
        return current_user

    # Give the inner function a unique name so FastAPI doesn't de-duplicate
    # guards with the same signature across different endpoints.
    _guard.__name__ = f"require_{action}_{resource}"
    return Depends(_guard)
