"""
Landlord invite endpoints.

POST   /landlords/invites                     — create invite (manager/owner/superadmin)
GET    /landlords/invites                     — list org's invites
DELETE /landlords/invites/{invite_id}         — revoke invite
GET    /landlords/onboarding/{token}          — public: fetch onboarding details
POST   /landlords/onboarding/{token}/complete — public: submit onboarding form
"""
import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, require_role
from app.core.database import get_db
from app.schemas.common import MessageResponse
from app.services.landlord_service import (
    CompleteLandlordOnboardingRequest,
    CompleteLandlordOnboardingResponse,
    CreateLandlordInviteRequest,
    LandlordInviteOut,
    LandlordOnboardingDetails,
    complete_onboarding,
    create_invite,
    get_invite_by_token,
    list_invites,
    revoke_invite,
)

router = APIRouter(prefix="/landlords", tags=["landlords"])


@router.post(
    "/invites",
    response_model=LandlordInviteOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("owner", "manager", "superadmin"))],
)
async def create_landlord_invite(
    body: CreateLandlordInviteRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> LandlordInviteOut:
    """Invite a landlord to view their properties on the platform."""
    from fastapi import HTTPException
    if not current_user.profile.organisation_id:
        raise HTTPException(status_code=400, detail="You must belong to an organisation")
    return await create_invite(
        db=db,
        organisation_id=current_user.profile.organisation_id,
        invited_by_profile_id=current_user.profile.id,
        body=body,
    )


@router.get(
    "/invites",
    response_model=list[LandlordInviteOut],
    dependencies=[Depends(require_role("owner", "manager", "superadmin"))],
)
async def list_landlord_invites(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[LandlordInviteOut]:
    from fastapi import HTTPException
    if not current_user.profile.organisation_id:
        raise HTTPException(status_code=400, detail="You must belong to an organisation")
    return await list_invites(db=db, organisation_id=current_user.profile.organisation_id)


@router.delete(
    "/invites/{invite_id}",
    response_model=MessageResponse,
    dependencies=[Depends(require_role("owner", "manager", "superadmin"))],
)
async def revoke_landlord_invite(
    invite_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    from fastapi import HTTPException
    if not current_user.profile.organisation_id:
        raise HTTPException(status_code=400, detail="You must belong to an organisation")
    await revoke_invite(
        db=db,
        invite_id=invite_id,
        organisation_id=current_user.profile.organisation_id,
    )
    return MessageResponse(message="Invite revoked")


# ── Public onboarding endpoints (no auth) ────────────────────────────────────


@router.get("/onboarding/{token}", response_model=LandlordOnboardingDetails)
async def get_landlord_onboarding(
    token: str,
    db: AsyncSession = Depends(get_db),
) -> LandlordOnboardingDetails:
    """Public: return invite details to pre-populate the onboarding form."""
    return await get_invite_by_token(db=db, token=token)


@router.post(
    "/onboarding/{token}/complete",
    response_model=CompleteLandlordOnboardingResponse,
    status_code=status.HTTP_201_CREATED,
)
async def complete_landlord_onboarding(
    token: str,
    body: CompleteLandlordOnboardingRequest,
    db: AsyncSession = Depends(get_db),
) -> CompleteLandlordOnboardingResponse:
    """Public: submit the onboarding form — creates Logto user and sends welcome email."""
    return await complete_onboarding(db=db, token=token, body=body)
