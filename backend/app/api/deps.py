"""
FastAPI dependency injection for authentication, authorisation, and DB sessions.

Multi-role design
-----------------
A user's authoritative roles come from the JWT claims on every request:
  - claims.org_roles  → organisation-scoped roles  (e.g. ["manager", "owner"])
  - claims.app_roles  → global/platform roles      (e.g. ["superadmin"])

CurrentUser.roles builds a de-duplicated list of role name strings from both
sources.  All guards (require_role, require_superadmin, require_org_access, …)
use that list.

Role ordering
-------------
Priority is stored in the `roles` table (migration 011) as an integer column.
Lower value = higher privilege (superadmin=0, tenant=40).  The list is cached
in-process for 5 minutes so every request doesn't hit the DB.

Profile.role stores the *highest-priority* role name purely as a display/
notification convenience and is re-synced from the JWT on every authenticated
request.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import dataclass, field
from typing import Callable

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import TokenClaims, extract_token_claims
from app.models.organisation import Organisation
from app.models.profile import Profile
from app.models.rbac import RoleModel


# ── Role priority cache ───────────────────────────────────────────────────────
# Loaded from the `roles` table, refreshed every 5 minutes.
# Format: { "rolename": priority_int } — lower = higher privilege.

_priority_cache: dict[str, int] = {}
_priority_cache_at: float = 0.0
_PRIORITY_TTL = 300.0   # seconds
_PRIORITY_LOCK = asyncio.Lock()

# Fallback order used only when the DB is unreachable on first load.
_FALLBACK_PRIORITY: dict[str, int] = {
    "superadmin":  0,
    "owner":      10,
    "manager":    20,
    "landlord":   25,
    "maintenance": 30,
    "tenant":     40,
}


async def _get_priority_map(db: AsyncSession) -> dict[str, int]:
    """Return a role-name → priority mapping, refreshing from DB as needed."""
    global _priority_cache, _priority_cache_at

    now = time.monotonic()
    if _priority_cache and (now - _priority_cache_at) < _PRIORITY_TTL:
        return _priority_cache

    async with _PRIORITY_LOCK:
        # Double-check after acquiring lock
        if _priority_cache and (time.monotonic() - _priority_cache_at) < _PRIORITY_TTL:
            return _priority_cache
        try:
            result = await db.execute(
                select(RoleModel.name, RoleModel.priority).order_by(RoleModel.priority)
            )
            _priority_cache = {row.name: row.priority for row in result}
            _priority_cache_at = time.monotonic()
        except Exception:
            # DB unavailable — use fallback so the service stays up
            if not _priority_cache:
                _priority_cache = dict(_FALLBACK_PRIORITY)
    return _priority_cache


def invalidate_priority_cache() -> None:
    """Call after modifying roles table so the next request re-reads from DB."""
    global _priority_cache_at
    _priority_cache_at = 0.0


# ── Role extraction from JWT ──────────────────────────────────────────────────


def _roles_from_claims(claims: TokenClaims) -> list[str]:
    """
    Build a de-duplicated list of role name strings from JWT claims.

    Logto org-scoped tokens may carry role names in two formats:
      - plain:        "manager"
      - org-prefixed: "org_abc123:manager"
    Both are normalised to just the role name.

    Returns raw strings — no enum mapping, no validation against the DB.
    Unknown role names are kept; DB guards will simply not match them.
    """
    seen: set[str] = set()
    result: list[str] = []

    all_raw: list[str] = list(claims.org_roles) + list(claims.app_roles)
    for raw in all_raw:
        name = raw.split(":")[-1].strip().lower()
        if name and name not in seen:
            seen.add(name)
            result.append(name)

    return result if result else ["tenant"]


async def _primary_role(roles: list[str], db: AsyncSession) -> str:
    """Return the single highest-priority role from a list (lowest priority int)."""
    priority_map = await _get_priority_map(db)
    # Sort by priority value; unknown roles get a high fallback so they sort last
    sorted_roles = sorted(roles, key=lambda r: priority_map.get(r, 9999))
    return sorted_roles[0] if sorted_roles else "tenant"


# ── CurrentUser context object ────────────────────────────────────────────────


@dataclass
class CurrentUser:
    profile: Profile
    claims: TokenClaims
    roles: list[str] = field(default_factory=list)

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
    def role(self) -> str:
        """Primary (highest-priority) role string — kept for backwards compatibility."""
        return self.profile.role  # already synced during _upsert_profile

    def has_role(self, *roles: str) -> bool:
        """True if the user holds ANY of the given roles."""
        return bool(set(self.roles) & set(roles))

    def is_owner_or_manager(self) -> bool:
        return self.has_role("owner", "manager", "superadmin")


# ── Profile upsert ────────────────────────────────────────────────────────────


async def _upsert_profile(claims: TokenClaims, db: AsyncSession) -> Profile:
    """
    Get or create a Profile for the authenticated user.
    Re-syncs the primary role from JWT on every call so Profile.role always
    reflects the current highest privilege the user holds in Logto.
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
    raw_roles = _roles_from_claims(claims)
    primary = await _primary_role(raw_roles, db)

    if profile is None:
        profile = Profile(
            logto_sub=claims.sub,
            logto_org_id=claims.org_id,
            organisation_id=org.id if org else None,
            role=primary,
            display_name=claims.name,
            email=claims.email,
            last_seen_at=now,
        )
        db.add(profile)
        await db.flush()
    else:
        profile.email = claims.email or profile.email
        profile.last_seen_at = now
        # Re-sync primary role on every request (Logto is the source of truth)
        profile.role = primary
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
    raw_roles = _roles_from_claims(claims)
    return CurrentUser(profile=profile, claims=claims, roles=raw_roles)


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


def require_role(*roles: str) -> Callable:
    """Ensure the current user holds at least one of the specified roles."""

    async def _guard(
        current_user: CurrentUser = Depends(get_current_user),
    ) -> CurrentUser:
        if not current_user.has_role(*roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Required role(s): {list(roles)}",
            )
        return current_user

    return _guard


def require_superadmin() -> Callable:
    """Only platform superadmins may call this endpoint."""

    async def _guard(
        current_user: CurrentUser = Depends(get_current_user),
    ) -> CurrentUser:
        if not current_user.has_role("superadmin"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Superadmin role required",
            )
        return current_user

    return _guard


def get_org_id(current_user: "CurrentUser") -> "uuid.UUID | None":
    """
    Return the user's organisation UUID, or None for superadmin.

    None signals "platform-wide access" to all service functions:
    queries should skip the org filter so superadmin sees all orgs' data.
    Non-superadmin users without org context receive a 403.
    """
    if current_user.has_role("superadmin"):
        return None  # always cross-org — don't scope to their personal org
    if current_user.org_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No organisation context in token",
        )
    return current_user.org_id


async def get_tenant_record(
    current_user: CurrentUser,
    db: AsyncSession,
) -> "Tenant | None":
    """
    If the current user holds the tenant role, return their Tenant record.
    Returns None for org-level users (owner/manager/superadmin).
    Used to auto-scope list endpoints so tenants only see their own records.
    """
    from app.models.tenant import Tenant

    if not current_user.has_role("tenant"):
        return None
    result = await db.execute(
        select(Tenant).where(Tenant.logto_user_id == current_user.claims.sub)
    )
    return result.scalar_one_or_none()


def require_org_access(allow_tenant_own: bool = False) -> Callable:
    """Ensure the user belongs to an organisation and has the right role."""

    async def _guard(
        current_user: CurrentUser = Depends(get_current_user),
    ) -> CurrentUser:
        # Superadmin has platform-wide access — no org context required.
        if current_user.has_role("superadmin"):
            return current_user
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
