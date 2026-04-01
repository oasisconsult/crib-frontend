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

router = APIRouter(prefix="/me", tags=["me"])


class ProfileOut(CamelModel):
    """
    Matches the frontend User interface exactly.

    Frontend expects:
      id, email, name, role, status, timezone, locale,
      createdAt, updatedAt, phone?, avatar?, organisationId?
    """

    id: str
    email: str
    name: str
    role: str
    status: str
    timezone: str
    locale: str
    phone: str | None = None
    avatar: str | None = None
    organisation_id: str | None = None
    created_at: datetime
    updated_at: datetime


class ProfilePatch(CamelModel):
    display_name: str | None = None
    phone: str | None = None


def _profile_out(p: object) -> ProfileOut:  # type: ignore[type-arg]
    from app.models.profile import Profile

    assert isinstance(p, Profile)

    # Derive a display name: prefer display_name, fall back to email prefix
    name = p.display_name or (p.email.split("@")[0] if p.email else "User")

    # Derive status from the profile — profiles don't have a status field,
    # so we map from anonymised_at (anonymised → inactive, else active)
    status = "inactive" if p.anonymised_at else "active"

    return ProfileOut(
        id=str(p.id),
        email=p.email or "",
        name=name,
        role=p.role.value,
        status=status,
        timezone="Africa/Kampala",  # default — extend Profile model to store this if needed
        locale="en-UG",  # default — extend Profile model to store this if needed
        phone=p.phone,
        avatar=p.avatar_url,
        organisation_id=str(p.organisation_id) if p.organisation_id else None,
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


@router.get("", response_model=ProfileOut)
async def get_me(
    current_user: CurrentUser = Depends(get_current_user),
) -> ProfileOut:
    return _profile_out(current_user.profile)


@router.post("/consent", response_model=ProfileOut)
async def record_consent(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProfileOut:
    profile = current_user.profile
    profile.gdpr_consent_given = True
    profile.gdpr_consent_at = datetime.now(timezone.utc)
    await db.flush()
    return _profile_out(profile)


@router.patch("", response_model=ProfileOut)
async def update_me(
    body: ProfilePatch,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProfileOut:
    profile = current_user.profile
    if body.display_name is not None:
        profile.display_name = body.display_name
    if body.phone is not None:
        profile.phone = body.phone
    await db.flush()
    return _profile_out(profile)
