"""
Profile / "me" endpoints.

GET  /me           — return the current user's profile
POST /me/consent   — record GDPR consent
PATCH /me          — update phone / display_name
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user
from app.core.database import get_db
from app.schemas.common import CamelModel

router = APIRouter(prefix="/me", tags=["me"])


class ProfileOut(CamelModel):
    id: str
    logto_sub: str
    role: str
    display_name: str | None
    email: str | None
    phone: str | None
    avatar_url: str | None
    gdpr_consent_given: bool
    organisation_id: str | None


class ProfilePatch(CamelModel):
    display_name: str | None = None
    phone: str | None = None


@router.get("", response_model=ProfileOut)
async def get_me(current_user: CurrentUser = Depends(get_current_user)) -> ProfileOut:
    p = current_user.profile
    return ProfileOut(
        id=str(p.id),
        logto_sub=p.logto_sub,
        role=p.role.value,
        display_name=p.display_name,
        email=p.email,
        phone=p.phone,
        avatar_url=p.avatar_url,
        gdpr_consent_given=p.gdpr_consent_given,
        organisation_id=str(p.organisation_id) if p.organisation_id else None,
    )


@router.post("/consent", response_model=ProfileOut)
async def record_consent(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProfileOut:
    profile = current_user.profile
    profile.gdpr_consent_given = True
    profile.gdpr_consent_at = datetime.now(timezone.utc)
    await db.flush()
    return await get_me(current_user)


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
    return await get_me(current_user)
