"""
FastAPI dependency injection for authentication, authorisation, and DB sessions.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Callable

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
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
    Updates cached email and last_seen_at on every call.
    """
    from datetime import datetime, timezone

    result = await db.execute(select(Profile).where(Profile.logto_sub == claims.sub))
    profile = result.scalar_one_or_none()

    org: Organisation | None = None
    if claims.org_id:
        org_result = await db.execute(
            select(Organisation).where(Organisation.logto_org_id == claims.org_id)
        )
        org = org_result.scalar_one_or_none()

    now = datetime.now(timezone.utc)

    if profile is None:
        role = Role.tenant
        if "superadmin" in claims.org_roles:
            role = Role.superadmin
        elif "owner" in claims.org_roles:
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
    """
    Resolve the current user from a user JWT.
    Rejects M2M tokens — use get_m2m_context for M2M-only endpoints.
    """
    if claims.is_m2m:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User token required; M2M token not accepted on this endpoint",
        )
    profile = await _upsert_profile(claims, db)
    return CurrentUser(profile=profile, claims=claims)


# ── M2M context ───────────────────────────────────────────────────────────────


@dataclass
class M2MContext:
    """Context object for M2M (machine-to-machine) requests."""

    claims: TokenClaims

    def has_role(self, *roles: str) -> bool:
        return self.claims.has_app_role(*roles)


async def get_m2m_context(
    claims: TokenClaims = Depends(extract_token_claims),
) -> M2MContext:
    """
    Dependency for endpoints that should only be called by M2M clients
    (Celery workers, internal services). Rejects user tokens.
    """
    if not claims.is_m2m:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="M2M token required",
        )
    return M2MContext(claims=claims)


# ── Role-based guards ─────────────────────────────────────────────────────────


def require_role(*roles: Role) -> Callable:
    """Ensure the current user has one of the specified roles."""

    async def _guard(
        current_user: CurrentUser = Depends(get_current_user),
    ) -> CurrentUser:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Required role(s): {[r.value for r in roles]}",
            )
        return current_user

    return _guard


def require_superadmin() -> Callable:
    """Only platform superadmins may call this endpoint."""

    async def _guard(
        current_user: CurrentUser = Depends(get_current_user),
    ) -> CurrentUser:
        if current_user.role != Role.superadmin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Superadmin role required",
            )
        return current_user

    return _guard


def require_org_access(allow_tenant_own: bool = False) -> Callable:
    """Ensure the user belongs to an organisation and has the right role."""

    async def _guard(
        current_user: CurrentUser = Depends(get_current_user),
    ) -> CurrentUser:
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
