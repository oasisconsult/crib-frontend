"""
Profile / "me" endpoints.

GET   /me          — return the current user's profile (shape matches frontend User type)
POST  /me/consent  — record GDPR consent
PATCH /me          — update phone / display_name
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user
from app.core.database import get_db
from app.schemas.common import CamelModel
from app.services.policy_service import PolicyService, get_policy_service

router = APIRouter(prefix="/me", tags=["me"])


class ProfileOut(CamelModel):
    """
    Matches the frontend User interface exactly.

    Frontend expects:
      id, email, name, role, roles, status, timezone, locale,
      createdAt, updatedAt, phone?, avatar?, organisationId?

    role  — primary (highest-priority) role string, kept for backwards compat
    roles — full list of roles the user currently holds (from JWT claims)
    """

    id: str
    email: str
    name: str
    display_name: str | None = None
    role: str
    roles: list[str]
    status: str
    timezone: str
    locale: str
    logto_sub: str
    gdpr_consent_given: bool = False
    phone: str | None = None
    avatar: str | None = None
    organisation_id: str | None = None
    is_read_only: bool = False
    # Populated for caretaker profiles; None for all others
    caretaker_meta: dict | None = None
    # Populated for landlord (read-only) and caretaker profiles for property scoping
    property_ids: list[str] | None = None
    created_at: datetime
    updated_at: datetime


class ProfilePatch(CamelModel):
    display_name: str | None = None
    phone: str | None = None


def _profile_out(current_user: CurrentUser) -> ProfileOut:
    p = current_user.profile

    display_name = p.display_name
    name = display_name or (p.email.split("@")[0] if p.email else "User")
    status = "inactive" if p.anonymised_at else "active"

    # SQLAlchemy DateTime columns are Python datetime at runtime;
    # cast via Any to satisfy strict type checkers.
    created_at: datetime = p.created_at  # type: ignore[assignment]
    updated_at: datetime = p.updated_at  # type: ignore[assignment]

    # Build caretaker_meta if this is a caretaker profile
    caretaker_meta: dict | None = None
    if p.caretaker_owner_profile_id is not None:
        caretaker_meta = {
            "ownerId":         str(p.caretaker_owner_profile_id),
            "ownerName":       "Property Owner",   # resolved by frontend via name
            "permissionLevel": p.caretaker_permission_level or "full",
        }

    # property_ids — populated for landlords (via LandlordPropertyAccess) and
    # caretakers (stored directly on profile).  Frontend uses this for scoping.
    property_ids: list[str] | None = None
    if p.caretaker_property_ids is not None:
        property_ids = [str(pid) for pid in (p.caretaker_property_ids or [])]

    return ProfileOut(
        id=str(p.id),
        email=p.email or "",
        name=name,
        display_name=display_name,
        role=p.role,
        roles=current_user.roles,
        status=status,
        timezone="Africa/Kampala",
        locale="en-UG",
        logto_sub=p.logto_sub,
        gdpr_consent_given=bool(p.gdpr_consent_given),
        phone=p.phone,
        avatar=p.avatar_url,
        organisation_id=str(p.organisation_id) if p.organisation_id else None,
        is_read_only=bool(p.is_read_only),
        caretaker_meta=caretaker_meta,
        property_ids=property_ids,
        created_at=created_at,
        updated_at=updated_at,
    )


@router.get("", response_model=ProfileOut)
async def get_me(
    current_user: CurrentUser = Depends(get_current_user),
) -> ProfileOut:
    return _profile_out(current_user)


@router.post("/consent", response_model=ProfileOut)
async def record_consent(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProfileOut:
    current_user.profile.gdpr_consent_given = True
    current_user.profile.gdpr_consent_at = datetime.now(timezone.utc)  # type: ignore[assignment]
    await db.flush()
    await db.refresh(current_user.profile)
    return _profile_out(current_user)


class PermissionsOut(CamelModel):
    """
    Effective permissions for the authenticated user.

    isSuperAdmin  — client should bypass ALL checks and show everything
    isReadOnly    — agency-managed landlord; only read actions are allowed
    permissions   — set of "resource:action" strings from the DB RBAC table,
                    OR ["*"] for superadmin (wildcard — has everything)
    """
    is_super_admin: bool
    is_read_only: bool
    permissions: list[str]


@router.get("/permissions", response_model=PermissionsOut)
async def get_my_permissions(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    policy: PolicyService = Depends(get_policy_service),
) -> PermissionsOut:
    """
    Return the current user's effective permission set.

    Superadmin: returns wildcard ["*"] — client bypasses all checks.
    Read-only (agency-managed landlord): only :read permissions are returned.
    Others: DB-driven union of all role permissions.
    """
    is_super = "superadmin" in current_user.roles
    is_read_only = bool(current_user.profile.is_read_only)

    if is_super:
        return PermissionsOut(
            is_super_admin=True,
            is_read_only=False,
            permissions=["*"],
        )

    # Load DB permissions for all roles the user holds
    all_perms: set[str] = set()
    for role in current_user.roles:
        role_perms = await policy._load_role_permissions(role, db)
        all_perms.update(role_perms)

    # Read-only override: strip all non-read permissions
    if is_read_only:
        all_perms = {p for p in all_perms if p.endswith(":read")}

    return PermissionsOut(
        is_super_admin=False,
        is_read_only=is_read_only,
        permissions=sorted(all_perms),
    )


@router.patch("", response_model=ProfileOut)
async def update_me(
    body: ProfilePatch,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProfileOut:
    if body.display_name is not None:
        current_user.profile.display_name = body.display_name
    if body.phone is not None:
        current_user.profile.phone = body.phone
    await db.flush()
    await db.refresh(current_user.profile)
    return _profile_out(current_user)
