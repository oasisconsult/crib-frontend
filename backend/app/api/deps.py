"""
FastAPI dependency injection for authentication, authorisation, and DB sessions.

Usage:
    @router.get("/properties")
    async def list_properties(
        current_user: CurrentUser = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ):
        ...

    @router.post("/settings")
    async def update_settings(
        _: CurrentUser = Depends(require_role(Role.manager, Role.owner)),
        ...
    ):
        ...
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from functools import wraps
from typing import Callable

from fastapi import Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import TokenClaims, extract_token_claims
from app.models.organisation import Organisation
from app.models.profile import Profile, Role


# ── CurrentUser context object ────────────────────────────────────────────────

@dataclass
class CurrentUser:
    profile: Profile
    claims: TokenClaims

    @property
    def id(self) -> uuid.UUID:
        return self.profile.id

    @property
    def sub(self) -> str:
        return self.profile.logto_sub

    @property
    def org_id(self) -> uuid.UUID | None:
        return self.profile.organisation_id

    @property
    def role(self) -> Role:
        return self.profile.role

    def has_role(self, *roles: Role) -> bool:
        return self.profile.role in roles

    def is_owner_or_manager(self) -> bool:
        return self.profile.role in (Role.owner, Role.manager)


# ── Profile upsert ────────────────────────────────────────────────────────────

async def _upsert_profile(claims: TokenClaims, db: AsyncSession) -> Profile:
    """
    Get or create a Profile for the authenticated user.

    On creation, links the profile to an Organisation via logto_org_id.
    Updates cached display_name, email, last_seen_at on every call.
    """
    from datetime import datetime, timezone

    result = await db.execute(
        select(Profile).where(Profile.logto_sub == claims.sub)
    )
    profile = result.scalar_one_or_none()

    org: Organisation | None = None
    if claims.org_id:
        org_result = await db.execute(
            select(Organisation).where(Organisation.logto_org_id == claims.org_id)
        )
        org = org_result.scalar_one_or_none()

    now = datetime.now(timezone.utc)

    if profile is None:
        # Determine role from org_roles claim
        role = Role.tenant
        if "owner" in claims.org_roles:
            role = Role.owner
        elif "manager" in claims.org_roles:
            role = Role.manager

        profile = Profile(
            logto_sub=claims.sub,
            logto_org_id=claims.org_id,
            organisation_id=org.id if org else None,
            role=role,
            display_name=claims.name,
            email=claims.email,
            last_seen_at=now,
        )
        db.add(profile)
        await db.flush()
    else:
        # Sync cached fields (display_name is NOT synced — user can override via PATCH /me)
        profile.email = claims.email or profile.email
        profile.last_seen_at = now
        if claims.org_id and profile.logto_org_id != claims.org_id:
            profile.logto_org_id = claims.org_id
            if org:
                profile.organisation_id = org.id

    return profile


# ── Primary dependency ────────────────────────────────────────────────────────

async def get_current_user(
    claims: TokenClaims = Depends(extract_token_claims),
    db: AsyncSession = Depends(get_db),
) -> CurrentUser:
    """Resolve and return the CurrentUser for the active request."""
    profile = await _upsert_profile(claims, db)
    return CurrentUser(profile=profile, claims=claims)


# ── Role-based guards ─────────────────────────────────────────────────────────

def require_role(*roles: Role) -> Callable:
    """
    Dependency factory: ensure the current user has one of the specified roles.

    Example:
        Depends(require_role(Role.owner, Role.manager))
    """
    async def _guard(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Required role(s): {[r.value for r in roles]}",
            )
        return current_user

    return _guard


def require_org_access(allow_tenant_own: bool = False) -> Callable:
    """
    Ensure the user belongs to the target organisation.

    When allow_tenant_own=True, tenants can access their own org-scoped data.
    Otherwise, only owner/manager roles can access org-level resources.
    """
    async def _guard(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if current_user.org_id is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No organisation context in token",
            )
        if not allow_tenant_own and not current_user.is_owner_or_manager():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Manager or owner role required",
            )
        return current_user

    return _guard
