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

    return ProfileOut(
        id=str(p.id),
        email=p.email or "",
        name=name,
        display_name=display_name,
        role=p.role.value,
        roles=[r.value for r in current_user.roles],
        status=status,
        timezone="Africa/Kampala",
        locale="en-UG",
        logto_sub=p.logto_sub,
        gdpr_consent_given=bool(p.gdpr_consent_given),
        phone=p.phone,
        avatar=p.avatar_url,
        organisation_id=str(p.organisation_id) if p.organisation_id else None,
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
