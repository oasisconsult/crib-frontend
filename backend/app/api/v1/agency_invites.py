"""
Agency invite endpoints (superadmin only for creation).

POST   /agency-invites                         — superadmin: create invite
GET    /agency-invites                         — superadmin: list all invites
DELETE /agency-invites/{invite_id}             — superadmin: revoke invite
GET    /agency-invites/onboarding/{token}      — public: fetch onboarding details
POST   /agency-invites/onboarding/{token}/complete — public: submit onboarding form
"""
import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, require_role
from app.core.database import get_db
from app.schemas.common import MessageResponse
from app.services.agency_invite_service import (
    AgencyInviteOut,
    AgencyOnboardingDetails,
    CompleteAgencyOnboardingRequest,
    CompleteAgencyOnboardingResponse,
    CreateAgencyInviteRequest,
    complete_agency_onboarding,
    create_agency_invite,
    get_agency_invite_by_token,
    list_agency_invites,
    resend_agency_invite,
    revoke_agency_invite,
)

router = APIRouter(prefix="/agency-invites", tags=["agency-invites"])


@router.post(
    "",
    response_model=AgencyInviteOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("superadmin"))],
)
async def create_invite(
    body: CreateAgencyInviteRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AgencyInviteOut:
    """Superadmin: invite a new agency onto the platform."""
    return await create_agency_invite(
        db=db,
        invited_by_profile_id=current_user.profile.id,
        body=body,
    )


@router.get(
    "",
    response_model=list[AgencyInviteOut],
    dependencies=[Depends(require_role("superadmin"))],
)
async def list_invites(
    db: AsyncSession = Depends(get_db),
) -> list[AgencyInviteOut]:
    return await list_agency_invites(db=db)


@router.post(
    "/{invite_id}/resend",
    response_model=AgencyInviteOut,
    dependencies=[Depends(require_role("superadmin"))],
)
async def resend_invite(
    invite_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> AgencyInviteOut:
    """Superadmin: resend onboarding email and extend expiry by 14 days."""
    return await resend_agency_invite(db=db, invite_id=invite_id)


@router.delete(
    "/{invite_id}",
    response_model=MessageResponse,
    dependencies=[Depends(require_role("superadmin"))],
)
async def revoke_invite(
    invite_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    await revoke_agency_invite(db=db, invite_id=invite_id)
    return MessageResponse(message="Invite revoked")


# ── Public onboarding ────────────────────────────────────────────────────────


@router.get("/onboarding/{token}", response_model=AgencyOnboardingDetails)
async def get_onboarding_details(
    token: str,
    db: AsyncSession = Depends(get_db),
) -> AgencyOnboardingDetails:
    """Public: return invite details to pre-populate the agency onboarding form."""
    return await get_agency_invite_by_token(db=db, token=token)


@router.post(
    "/onboarding/{token}/complete",
    response_model=CompleteAgencyOnboardingResponse,
    status_code=status.HTTP_201_CREATED,
)
async def complete_onboarding(
    token: str,
    body: CompleteAgencyOnboardingRequest,
    db: AsyncSession = Depends(get_db),
) -> CompleteAgencyOnboardingResponse:
    """Public: submit agency onboarding form — creates Logto org + manager user."""
    return await complete_agency_onboarding(db=db, token=token, body=body)
