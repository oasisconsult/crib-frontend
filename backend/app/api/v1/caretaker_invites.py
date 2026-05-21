"""
Caretaker invite endpoints.

Authenticated (owner / superadmin):
  POST   /caretaker-invites                         — create invite + send email
  GET    /caretaker-invites                         — list owner's sent invites
  POST   /caretaker-invites/{invite_id}/resend      — resend invite email
  DELETE /caretaker-invites/{invite_id}             — revoke pending invite

  GET    /caretakers                                — list active caretakers
  PATCH  /caretakers/{caretaker_id}                 — update property scope / level
  POST   /caretakers/{caretaker_id}/deactivate      — deactivate (blocks login)

Public (no auth — used by the onboarding page):
  GET    /caretaker-invites/onboarding/{token}      — fetch invite details
  POST   /caretaker-invites/onboarding/{token}/complete — submit + create account
"""
import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, require_role
from app.core.database import get_db
from app.schemas.common import MessageResponse
from app.services.caretaker_invite_service import (
    ActiveCaretakerOut,
    CaretakerInviteOut,
    CaretakerOnboardingDetails,
    CompleteCaretakerOnboardingRequest,
    CompleteCaretakerOnboardingResponse,
    CreateCaretakerInviteRequest,
    UpdateCaretakerRequest,
    complete_caretaker_onboarding,
    create_caretaker_invite,
    deactivate_caretaker,
    get_caretaker_onboarding_details,
    list_active_caretakers,
    list_caretaker_invites,
    resend_caretaker_invite,
    revoke_caretaker_invite,
    update_caretaker,
)

router = APIRouter(tags=["caretakers"])


# ── Invite management ─────────────────────────────────────────────────────────


@router.post(
    "/caretaker-invites",
    response_model=CaretakerInviteOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("owner", "superadmin"))],
)
async def create_invite(
    body: CreateCaretakerInviteRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CaretakerInviteOut:
    """Owner: invite someone to manage a subset of their properties."""
    return await create_caretaker_invite(
        db=db,
        owner_profile_id=current_user.profile.id,
        body=body,
    )


@router.get(
    "/caretaker-invites",
    response_model=list[CaretakerInviteOut],
    dependencies=[Depends(require_role("owner", "superadmin"))],
)
async def list_invites(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[CaretakerInviteOut]:
    """Owner: list all caretaker invites they have sent."""
    return await list_caretaker_invites(
        db=db,
        owner_profile_id=current_user.profile.id,
    )


@router.post(
    "/caretaker-invites/{invite_id}/resend",
    response_model=CaretakerInviteOut,
    dependencies=[Depends(require_role("owner", "superadmin"))],
)
async def resend_invite(
    invite_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CaretakerInviteOut:
    """Owner: resend a pending caretaker invitation (extends expiry by 7 days)."""
    return await resend_caretaker_invite(
        db=db,
        invite_id=invite_id,
        owner_profile_id=current_user.profile.id,
    )


@router.delete(
    "/caretaker-invites/{invite_id}",
    response_model=MessageResponse,
    dependencies=[Depends(require_role("owner", "superadmin"))],
)
async def revoke_invite(
    invite_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Owner: revoke a pending caretaker invitation."""
    await revoke_caretaker_invite(
        db=db,
        invite_id=invite_id,
        owner_profile_id=current_user.profile.id,
    )
    return MessageResponse(message="Caretaker invite revoked")


# ── Active caretaker management ───────────────────────────────────────────────


@router.get(
    "/caretakers",
    response_model=list[ActiveCaretakerOut],
    dependencies=[Depends(require_role("owner", "superadmin"))],
)
async def list_caretakers(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ActiveCaretakerOut]:
    """Owner: list all active (and deactivated) caretakers they manage."""
    return await list_active_caretakers(
        db=db,
        owner_profile_id=current_user.profile.id,
    )


@router.patch(
    "/caretakers/{caretaker_id}",
    response_model=ActiveCaretakerOut,
    dependencies=[Depends(require_role("owner", "superadmin"))],
)
async def update_caretaker_access(
    caretaker_id: uuid.UUID,
    body: UpdateCaretakerRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ActiveCaretakerOut:
    """Owner: update a caretaker's property scope or permission level."""
    return await update_caretaker(
        db=db,
        caretaker_id=caretaker_id,
        owner_profile_id=current_user.profile.id,
        body=body,
    )


@router.post(
    "/caretakers/{caretaker_id}/deactivate",
    response_model=MessageResponse,
    dependencies=[Depends(require_role("owner", "superadmin"))],
)
async def deactivate(
    caretaker_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """
    Owner: deactivate a caretaker.
    Account is soft-deleted (preserved for audit); login is blocked immediately
    via Logto suspension. Can be re-invited later.
    """
    await deactivate_caretaker(
        db=db,
        caretaker_id=caretaker_id,
        owner_profile_id=current_user.profile.id,
    )
    return MessageResponse(message="Caretaker deactivated. Their login has been blocked.")


# ── Public onboarding ─────────────────────────────────────────────────────────


@router.get(
    "/caretaker-invites/onboarding/{token}",
    response_model=CaretakerOnboardingDetails,
)
async def get_onboarding_details(
    token: str,
    db: AsyncSession = Depends(get_db),
) -> CaretakerOnboardingDetails:
    """Public: return invite details to pre-populate the caretaker onboarding page."""
    return await get_caretaker_onboarding_details(db=db, token=token)


@router.post(
    "/caretaker-invites/onboarding/{token}/complete",
    response_model=CompleteCaretakerOnboardingResponse,
    status_code=status.HTTP_201_CREATED,
)
async def complete_onboarding(
    token: str,
    body: CompleteCaretakerOnboardingRequest,
    db: AsyncSession = Depends(get_db),
) -> CompleteCaretakerOnboardingResponse:
    """Public: submit caretaker onboarding form — creates Logto user + Profile."""
    return await complete_caretaker_onboarding(db=db, token=token, body=body)
