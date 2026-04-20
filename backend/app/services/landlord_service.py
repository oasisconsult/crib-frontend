"""
Landlord invite service.

Handles:
  - Creating invites (manager/owner/superadmin → landlord)
  - Token-based onboarding: fetch invite details, complete onboarding
  - Logto user creation + landlord role assignment
  - Granting property access records
"""
from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timedelta, timezone

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.landlord_invite import InviteStatus, LandlordInvite, LandlordPropertyAccess
from app.models.organisation import Organisation
from app.models.profile import Profile
from app.models.property import Property
from app.schemas.common import CamelModel

log = structlog.get_logger(__name__)
settings = get_settings()

# ── Request / response schemas ────────────────────────────────────────────────


class CreateLandlordInviteRequest(CamelModel):
    email:      str
    first_name: str
    last_name:  str
    phone:      str | None = None
    property_ids: list[str]
    message:    str | None = None


class LandlordInviteOut(CamelModel):
    id:           str
    email:        str
    first_name:   str
    last_name:    str
    property_ids: list[str]
    status:       str
    token:        str
    expires_at:   str
    created_at:   str


class LandlordOnboardingDetails(CamelModel):
    """Returned by GET /landlords/onboarding/{token} — used to pre-fill the form."""
    invite_id:    str
    email:        str
    first_name:   str
    last_name:    str
    phone:        str | None
    agency_name:  str
    agency_email: str | None
    agency_phone: str | None
    properties:   list[dict]   # [{id, name, address}]
    message:      str | None
    expires_at:   str


class CompleteLandlordOnboardingRequest(CamelModel):
    first_name:   str
    last_name:    str
    phone:        str | None = None
    national_id:  str | None = None
    address:      str | None = None
    gdpr_consent: bool = False


class CompleteLandlordOnboardingResponse(CamelModel):
    message: str


# ── Service functions ─────────────────────────────────────────────────────────


async def create_invite(
    *,
    db: AsyncSession,
    organisation_id: uuid.UUID,
    invited_by_profile_id: uuid.UUID,
    body: CreateLandlordInviteRequest,
) -> LandlordInviteOut:
    """Create a landlord invite and return it."""
    # Validate properties belong to the org
    prop_ids = [uuid.UUID(pid) for pid in body.property_ids]
    if prop_ids:
        result = await db.execute(
            select(Property.id).where(
                Property.id.in_(prop_ids),
                Property.organisation_id == organisation_id,
            )
        )
        valid_ids = {row[0] for row in result}
        invalid = set(prop_ids) - valid_ids
        if invalid:
            from fastapi import HTTPException, status
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Properties not found in your organisation: {[str(i) for i in invalid]}",
            )

    invite = LandlordInvite(
        organisation_id=organisation_id,
        invited_by_profile_id=invited_by_profile_id,
        email=body.email,
        first_name=body.first_name,
        last_name=body.last_name,
        phone=body.phone,
        property_ids=[str(pid) for pid in prop_ids],
        message=body.message,
        token=secrets.token_urlsafe(48),
        status=InviteStatus.PENDING,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )
    db.add(invite)
    await db.flush()

    s = get_settings()
    onboarding_url = f"{s.frontend_url}/onboarding/landlord/{invite.token}"
    await _send_invite_email(
        email=invite.email,
        first_name=invite.first_name,
        onboarding_url=onboarding_url,
    )
    log.info("landlord_invite.created", invite_id=str(invite.id), email=body.email)
    return _to_out(invite)


async def get_invite_by_token(*, db: AsyncSession, token: str) -> LandlordOnboardingDetails:
    """Fetch invite details for the onboarding form (public endpoint)."""
    from fastapi import HTTPException, status as http_status

    result = await db.execute(select(LandlordInvite).where(LandlordInvite.token == token))
    invite = result.scalar_one_or_none()

    if not invite:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Invite not found")
    if invite.status != InviteStatus.PENDING:
        raise HTTPException(status_code=http_status.HTTP_410_GONE, detail=f"Invite is {invite.status}")
    if invite.expires_at < datetime.now(timezone.utc):
        invite.status = InviteStatus.EXPIRED
        await db.flush()
        raise HTTPException(status_code=http_status.HTTP_410_GONE, detail="Invite has expired")

    # Fetch org details
    org_result = await db.execute(
        select(Organisation).where(Organisation.id == invite.organisation_id)
    )
    org = org_result.scalar_one_or_none()

    # Fetch property names
    prop_ids = [uuid.UUID(pid) for pid in (invite.property_ids or [])]
    properties = []
    if prop_ids:
        props_result = await db.execute(
            select(Property).where(Property.id.in_(prop_ids))
        )
        for p in props_result.scalars():
            addr = p.address or {}
            properties.append({
                "id": str(p.id),
                "name": p.name,
                "address": f"{addr.get('street', '')} {addr.get('city', '')}".strip(),
            })

    return LandlordOnboardingDetails(
        invite_id=str(invite.id),
        email=invite.email,
        first_name=invite.first_name,
        last_name=invite.last_name,
        phone=invite.phone,
        agency_name=org.name if org else "",
        agency_email=org.settings.get("contact_email") if org else None,
        agency_phone=org.settings.get("contact_phone") if org else None,
        properties=properties,
        message=invite.message,
        expires_at=invite.expires_at.isoformat(),
    )


async def complete_onboarding(
    *,
    db: AsyncSession,
    token: str,
    body: CompleteLandlordOnboardingRequest,
) -> CompleteLandlordOnboardingResponse:
    """
    Complete landlord onboarding:
      1. Validate token
      2. Create Logto user + assign landlord role
      3. Create Profile
      4. Grant LandlordPropertyAccess rows
      5. Send welcome email
    """
    from fastapi import HTTPException, status as http_status
    from app.services import logto_service
    from app.services.logto_service import _generate_temp_password

    result = await db.execute(select(LandlordInvite).where(LandlordInvite.token == token))
    invite = result.scalar_one_or_none()

    if not invite or invite.status != InviteStatus.PENDING:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Invalid or expired invite")
    if invite.expires_at < datetime.now(timezone.utc):
        invite.status = InviteStatus.EXPIRED
        await db.flush()
        raise HTTPException(status_code=http_status.HTTP_410_GONE, detail="Invite has expired")

    temp_password = _generate_temp_password()

    # 1. Create Logto user
    logto_user_id = await logto_service.create_landlord_user(
        email=invite.email,
        first_name=body.first_name,
        last_name=body.last_name,
        temp_password=temp_password,
    )

    # 2. Create Profile
    existing = await db.execute(select(Profile).where(Profile.email == invite.email))
    profile = existing.scalar_one_or_none()

    if profile is None:
        profile = Profile(
            logto_sub=logto_user_id or f"pending_{invite.id}",
            organisation_id=None,  # landlords have no org
            role="landlord",
            display_name=f"{body.first_name} {body.last_name}",
            email=invite.email,
            phone=body.phone,
            is_read_only=True,
            gdpr_consent_given=body.gdpr_consent,
        )
        db.add(profile)
        await db.flush()
    else:
        profile.role = "landlord"
        profile.is_read_only = True
        if logto_user_id:
            profile.logto_sub = logto_user_id
        if body.phone:
            profile.phone = body.phone

    # 3. Grant property access
    for pid_str in (invite.property_ids or []):
        try:
            pid = uuid.UUID(pid_str)
        except ValueError:
            continue
        # Check for existing record
        existing_access = await db.execute(
            select(LandlordPropertyAccess).where(
                LandlordPropertyAccess.landlord_profile_id == profile.id,
                LandlordPropertyAccess.property_id == pid,
            )
        )
        if not existing_access.scalar_one_or_none():
            db.add(LandlordPropertyAccess(
                landlord_profile_id=profile.id,
                property_id=pid,
                is_read_only=True,
                granted_by_profile_id=invite.invited_by_profile_id,
            ))

    # 4. Mark invite accepted
    invite.status = InviteStatus.ACCEPTED
    invite.accepted_at = datetime.now(timezone.utc)
    await db.flush()

    # 5. Send welcome email
    s = get_settings()
    await logto_service.send_landlord_welcome_email(
        email=invite.email,
        first_name=body.first_name,
        temp_password=temp_password,
        frontend_url=s.frontend_url,
    )

    log.info("landlord.onboarding_complete", email=invite.email, profile_id=str(profile.id))
    return CompleteLandlordOnboardingResponse(
        message="Account created. Check your email for login details."
    )


async def list_invites(*, db: AsyncSession, organisation_id: uuid.UUID) -> list[LandlordInviteOut]:
    result = await db.execute(
        select(LandlordInvite)
        .where(LandlordInvite.organisation_id == organisation_id)
        .order_by(LandlordInvite.created_at.desc())
    )
    return [_to_out(inv) for inv in result.scalars()]


async def revoke_invite(*, db: AsyncSession, invite_id: uuid.UUID, organisation_id: uuid.UUID) -> None:
    from fastapi import HTTPException, status as http_status

    result = await db.execute(
        select(LandlordInvite).where(
            LandlordInvite.id == invite_id,
            LandlordInvite.organisation_id == organisation_id,
        )
    )
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Invite not found")
    invite.status = InviteStatus.REVOKED
    await db.flush()


async def resend_invite_email(
    *,
    db: AsyncSession,
    invite_id: uuid.UUID,
    organisation_id: uuid.UUID,
) -> LandlordInviteOut:
    from fastapi import HTTPException, status as http_status

    result = await db.execute(
        select(LandlordInvite).where(
            LandlordInvite.id == invite_id,
            LandlordInvite.organisation_id == organisation_id,
        )
    )
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Invite not found")
    if invite.status != InviteStatus.PENDING:
        raise HTTPException(
            status_code=http_status.HTTP_409_CONFLICT,
            detail=f"Cannot resend a {invite.status} invite",
        )

    # Extend expiry by 7 days from now
    invite.expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.flush()

    s = get_settings()
    onboarding_url = f"{s.frontend_url}/onboarding/landlord/{invite.token}"
    await _send_invite_email(
        email=invite.email,
        first_name=invite.first_name,
        onboarding_url=onboarding_url,
    )
    log.info("landlord_invite.resent", invite_id=str(invite.id), email=invite.email)
    return _to_out(invite)


async def _send_invite_email(*, email: str, first_name: str, onboarding_url: str) -> None:
    from app.integrations.notifications.email import get_email_provider

    subject = "You've been invited to view your properties on Crib"
    body = (
        f"Hi {first_name},\n\n"
        "Your property manager has invited you to access your properties on Crib.\n\n"
        "Click the link below to set up your account:\n"
        f"{onboarding_url}\n\n"
        "This link expires in 7 days.\n\n"
        "— The Crib Team"
    )
    provider = get_email_provider()
    result = await provider.send(
        recipient_name=first_name,
        recipient_email=email,
        recipient_phone=None,
        subject=subject,
        body=body,
    )
    if result.success:
        log.info("landlord_invite.email_sent", email=email)
    else:
        log.warning("landlord_invite.email_failed", email=email, reason=result.failure_reason)


def _to_out(invite: LandlordInvite) -> LandlordInviteOut:
    return LandlordInviteOut(
        id=str(invite.id),
        email=invite.email,
        first_name=invite.first_name,
        last_name=invite.last_name,
        property_ids=invite.property_ids or [],
        status=invite.status,
        token=invite.token,
        expires_at=invite.expires_at.isoformat(),
        created_at=invite.created_at.isoformat(),
    )
