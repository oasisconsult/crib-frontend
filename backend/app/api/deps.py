"""
FastAPI dependency injection for authentication, authorisation, and DB sessions.

Role resolution — Phase 4 (DB-authoritative)
--------------------------------------------
Roles are now stored in `profiles.roles_db` (JSONB list) and treated as the
single source of truth.  Every authenticated request writes the JWT-derived
roles into `roles_db` so the column stays current; the *read* path always
comes from the DB, never directly from the JWT.

Concretely:
  1. JWT decoded → `claims.org_roles` + `claims.app_roles` (identity only)
  2. `_upsert_profile` writes those roles into `profile.roles_db`
  3. `get_current_user` reads `profile.roles_db` — if non-NULL/non-empty, those
     DB roles are used for all authorisation decisions
  4. Fallback: if `roles_db` is NULL (profile created before migration 034)
     the function falls back to parsing JWT claims directly (Phase 1-3 behaviour)

This mirrors the GeoBox Phase 4 pattern: `request.state.rbac.roles` (DB) with
JWT fallback.  Role changes made directly in the DB (e.g. by an admin patching
`profiles.roles_db`) take effect on the very next request without waiting for
the user's token to expire.

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

from fastapi import Depends, HTTPException, Request, status
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
    "caretaker":  15,   # delegated property manager — scoped to specific properties
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


async def _upsert_profile(
    claims: TokenClaims,
    db: AsyncSession,
    rbac_roles: list[str] | None = None,
) -> Profile:
    """
    Get or create a Profile for the authenticated user.
    Uses RBAC DB roles (Phase 4) when available, falls back to JWT claims.
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
    # Phase 4: prefer RBAC DB roles over JWT-derived roles for profile.role display
    effective_roles = rbac_roles if rbac_roles else _roles_from_claims(claims)
    primary = await _primary_role(effective_roles, db)

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
        profile.role = primary
        if claims.org_id and profile.logto_org_id != claims.org_id:
            profile.logto_org_id = claims.org_id
            if org:
                profile.organisation_id = org.id

    return profile


# ── Primary dependency ────────────────────────────────────────────────────────


async def get_current_user(
    request: Request,
    claims: TokenClaims = Depends(extract_token_claims),
    db: AsyncSession = Depends(get_db),
) -> CurrentUser:
    """
    Resolve the current user from a user JWT.
    Rejects M2M tokens — use get_m2m_context for M2M-only endpoints.

    Phase 4 (DB-authoritative roles):
    Roles are resolved from `request.state.rbac` (set by AppContextMiddleware
    using the dedicated geobox-rbac RBAC database) when available.  This is
    the GeoBox Phase 4 pattern: DB is authoritative, JWT is used only for
    identity + fallback when the middleware is absent.

    Fallback chain:
      1. request.state.rbac.roles  — RBAC DB (most authoritative)
      2. _roles_from_claims(claims) — JWT claims (Phase 1-3 / no RBAC DB)
    """
    if claims.is_m2m:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User token required; M2M token not accepted on this endpoint",
        )

    # ── Session staleness check ───────────────────────────────────────────────
    # If an admin invalidated this user's session (role/org change), force
    # the frontend to silently refresh the token before continuing.
    from app.core.session_cache import is_session_stale, clear_stale_marker
    if await is_session_stale(claims.sub):
        await clear_stale_marker(claims.sub)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session refresh required — role or permissions have changed",
            headers={"X-Crib-Auth-Refresh": "true"},
        )

    # ── Phase 4: DB-authoritative role resolution ─────────────────────────────
    # Read RBAC context before upsert so profile.role is set correctly in the DB.
    rbac_ctx = getattr(request.state, "rbac", None)
    rbac_roles: list[str] | None = list(rbac_ctx.roles) if (rbac_ctx and rbac_ctx.roles) else None

    profile = await _upsert_profile(claims, db, rbac_roles=rbac_roles)

    if rbac_roles:
        raw_roles: list[str] = rbac_roles
    else:
        # Phase 1-3 fallback — JWT claims (or RBAC middleware unavailable)
        raw_roles = _roles_from_claims(claims)

    # ── Caretaker detection ───────────────────────────────────────────────────
    # A caretaker logs in with a 'caretaker' Logto role (set during onboarding).
    # profile.caretaker_owner_profile_id is the authoritative signal — if it is
    # set we always guarantee both "caretaker" AND "owner" are in the roles list:
    #   • "caretaker" — lets property endpoints apply delegated-property scoping
    #   • "owner"     — lets them pass is_owner_or_manager() dashboard guards
    # This is safe to apply unconditionally because the API layer still enforces
    # the property-level filter when "caretaker" is present in roles.
    if profile.caretaker_owner_profile_id is not None:
        roles_set = set(raw_roles)
        extra: list[str] = []
        if "caretaker" not in roles_set:
            extra.append("caretaker")
        if "owner" not in roles_set:
            extra.append("owner")
        if extra:
            raw_roles = raw_roles + extra

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


def require_genuine_owner() -> Callable:
    """
    Owner or superadmin only — explicitly blocks caretakers.

    Caretakers receive an injected "owner" role in get_current_user() so they
    can pass is_owner_or_manager() guards on data endpoints.  This guard MUST
    be used instead of require_role("owner", "superadmin") on account-management
    endpoints that only a real owner should perform (e.g. inviting / managing
    caretakers).  Checking for "caretaker" in roles takes precedence over any
    injected "owner" role.
    """

    async def _guard(
        current_user: CurrentUser = Depends(get_current_user),
    ) -> CurrentUser:
        if current_user.has_role("caretaker"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Caretakers cannot perform account-management operations",
            )
        if not current_user.has_role("owner", "superadmin"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Required role(s): ['owner', 'superadmin']",
            )
        return current_user

    return _guard


def require_financial_access() -> Callable:
    """
    Block operations_only caretakers from financial analytics endpoints.

    Caretakers with permissionLevel == "operations_only" may see payment status
    (who paid / who hasn't) but must NOT access financial charts or aggregate
    analytics.  All other roles pass through.
    """

    async def _guard(
        current_user: CurrentUser = Depends(get_current_user),
    ) -> CurrentUser:
        if current_user.has_role("caretaker"):
            level = getattr(current_user.profile, "caretaker_permission_level", None) or "full"
            if level == "operations_only":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Financial analytics are not available for operations-only caretakers",
                )
        return current_user

    return _guard


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
