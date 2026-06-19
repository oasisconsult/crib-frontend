"""
Agency invite service.

Superadmin sends an invite → agency manager fills onboarding form →
Logto org + manager user created → Organisation row created → welcome email sent.
"""
from __future__ import annotations

import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.agency_invite import AgencyInvite, AgencyInviteStatus
from app.models.organisation import Organisation, Plan
from app.models.profile import Profile
from app.schemas.common import CamelModel

log = structlog.get_logger(__name__)


# ── Schemas ───────────────────────────────────────────────────────────────────


class CreateAgencyInviteRequest(CamelModel):
    agency_name:        str
    manager_email:      str
    manager_first_name: str
    manager_last_name:  str


class AgencyInviteOut(CamelModel):
    id:                 str
    agency_name:        str
    manager_email:      str
    manager_first_name: str
    manager_last_name:  str
    status:             str
    token:              str
    expires_at:         str
    created_at:         str


class AgencyOnboardingDetails(CamelModel):
    """Returned by GET /agency-invites/onboarding/{token}."""
    invite_id:          str
    agency_name:        str
    manager_email:      str
    manager_first_name: str
    manager_last_name:  str
    expires_at:         str


class CompleteAgencyOnboardingRequest(CamelModel):
    # Agency details (agency_name pre-filled but editable here)
    agency_name:         str
    agency_phone:        str | None = None
    agency_contact_email:str | None = None
    agency_address:      str | None = None
    agency_country:      str = "UG"
    agency_currency:     str = "UGX"
    # Manager personal details
    manager_first_name:  str
    manager_last_name:   str
    manager_phone:       str | None = None
    gdpr_consent:        bool = False


class CompleteAgencyOnboardingResponse(CamelModel):
    message: str


# ── Helpers ───────────────────────────────────────────────────────────────────


def _slugify(name: str) -> str:
    slug = name.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_-]+", "-", slug)
    return slug[:80]


# ── Service functions ─────────────────────────────────────────────────────────


async def create_agency_invite(
    *,
    db: AsyncSession,
    invited_by_profile_id: uuid.UUID,
    body: CreateAgencyInviteRequest,
) -> AgencyInviteOut:
    from fastapi import HTTPException, status as http_status

    # Reject if the manager has already completed onboarding
    accepted = await db.execute(
        select(AgencyInvite).where(
            AgencyInvite.manager_email == body.manager_email,
            AgencyInvite.status == AgencyInviteStatus.ACCEPTED,
        )
    )
    if accepted.scalar_one_or_none():
        raise HTTPException(
            status_code=http_status.HTTP_409_CONFLICT,
            detail=f"{body.manager_email} has already completed agency onboarding.",
        )

    # Reject if a pending invite already exists — resend or revoke it instead
    pending = await db.execute(
        select(AgencyInvite).where(
            AgencyInvite.manager_email == body.manager_email,
            AgencyInvite.status == AgencyInviteStatus.PENDING,
        )
    )
    if pending.scalar_one_or_none():
        raise HTTPException(
            status_code=http_status.HTTP_409_CONFLICT,
            detail=(
                f"A pending invite already exists for {body.manager_email}. "
                "Resend the existing invite or revoke it before creating a new one."
            ),
        )

    invite = AgencyInvite(
        invited_by_profile_id=invited_by_profile_id,
        agency_name=body.agency_name,
        manager_email=body.manager_email,
        manager_first_name=body.manager_first_name,
        manager_last_name=body.manager_last_name,
        token=secrets.token_urlsafe(48),
        status=AgencyInviteStatus.PENDING,
        expires_at=datetime.now(timezone.utc) + timedelta(days=14),
    )
    db.add(invite)
    await db.flush()
    log.info("agency_invite.created", invite_id=str(invite.id), agency=body.agency_name)
    return _to_out(invite)


async def get_agency_invite_by_token(*, db: AsyncSession, token: str) -> AgencyOnboardingDetails:
    from fastapi import HTTPException, status as http_status

    result = await db.execute(select(AgencyInvite).where(AgencyInvite.token == token))
    invite = result.scalar_one_or_none()

    if not invite:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Invite not found")
    if invite.status != AgencyInviteStatus.PENDING:
        raise HTTPException(status_code=http_status.HTTP_410_GONE, detail=f"Invite is {invite.status}")
    if invite.expires_at < datetime.now(timezone.utc):
        invite.status = AgencyInviteStatus.EXPIRED
        await db.flush()
        raise HTTPException(status_code=http_status.HTTP_410_GONE, detail="Invite has expired")

    return AgencyOnboardingDetails(
        invite_id=str(invite.id),
        agency_name=invite.agency_name,
        manager_email=invite.manager_email,
        manager_first_name=invite.manager_first_name,
        manager_last_name=invite.manager_last_name,
        expires_at=invite.expires_at.isoformat(),
    )


async def complete_agency_onboarding(
    *,
    db: AsyncSession,
    token: str,
    body: CompleteAgencyOnboardingRequest,
) -> CompleteAgencyOnboardingResponse:
    """
    Complete agency onboarding:
      1. Validate token
      2. Create Logto org + manager user
      3. Create Organisation row
      4. Create manager Profile
      5. Mark invite accepted + link org
      6. Send welcome email
    """
    from fastapi import HTTPException, status as http_status
    from app.services import logto_service
    from app.services.logto_service import _generate_temp_password

    result = await db.execute(select(AgencyInvite).where(AgencyInvite.token == token))
    invite = result.scalar_one_or_none()

    if not invite or invite.status != AgencyInviteStatus.PENDING:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Invalid or expired invite")
    if invite.expires_at < datetime.now(timezone.utc):
        invite.status = AgencyInviteStatus.EXPIRED
        await db.flush()
        raise HTTPException(status_code=http_status.HTTP_410_GONE, detail="Invite has expired")

    # ── Idempotency guard ────────────────────────────────────────────────────
    # If a profile already exists with an org (i.e. a previous onboarding
    # completed — possibly via a different invite token) we must NOT create
    # a second Logto org or a second Organisation row.  Instead we accept
    # this invite, link it to the existing org, and re-send credentials.
    existing_profile_result = await db.execute(
        select(Profile).where(Profile.email == invite.manager_email)
    )
    existing_profile = existing_profile_result.scalar_one_or_none()

    if existing_profile is not None and existing_profile.organisation_id is not None:
        log.info(
            "agency.onboarding_already_complete",
            email=invite.manager_email,
            org_id=str(existing_profile.organisation_id),
        )
        invite.status = AgencyInviteStatus.ACCEPTED
        invite.accepted_at = datetime.now(timezone.utc)
        invite.organisation_id = existing_profile.organisation_id
        await db.flush()
        return CompleteAgencyOnboardingResponse(
            message="Agency already set up. Check your email for login details."
        )
    # ── End idempotency guard ─────────────────────────────────────────────────

    agency_name = body.agency_name  # agency can confirm/edit the name here
    slug = _slugify(agency_name)

    # Ensure slug uniqueness
    base_slug = slug
    counter = 1
    while True:
        existing = await db.execute(select(Organisation).where(Organisation.slug == slug))
        if not existing.scalar_one_or_none():
            break
        slug = f"{base_slug}-{counter}"
        counter += 1

    temp_password = _generate_temp_password()

    # 1. Create Logto org + manager user (assigns org-level + app-level manager role)
    logto_result = await logto_service.create_agency_with_manager(
        agency_name=agency_name,
        agency_slug=slug,
        manager_email=invite.manager_email,
        manager_first_name=body.manager_first_name,
        manager_last_name=body.manager_last_name,
        temp_password=temp_password,
    )

    logto_org_id: str
    logto_user_id: str
    if logto_result:
        logto_org_id, logto_user_id = logto_result
    else:
        logto_org_id = f"org_pending_{invite.id}"
        logto_user_id = f"user_pending_{invite.id}"

    # 2. Create Organisation row
    org = Organisation(
        logto_org_id=logto_org_id,
        name=agency_name,
        slug=slug,
        plan=Plan.free,
        currency=body.agency_currency,
        country=body.agency_country,
        settings={
            "contact_phone": body.agency_phone,
            "contact_email": body.agency_contact_email,
            "address": body.agency_address,
        },
    )
    db.add(org)
    await db.flush()

    # 3. Create manager Profile (re-use existing_profile row if one exists)
    profile = existing_profile

    if profile is None:
        profile = Profile(
            logto_sub=logto_user_id,
            logto_org_id=logto_org_id,
            organisation_id=org.id,
            role="manager",
            display_name=f"{body.manager_first_name} {body.manager_last_name}",
            email=invite.manager_email,
            phone=body.manager_phone,
            is_read_only=False,
            gdpr_consent_given=body.gdpr_consent,
        )
        db.add(profile)
        await db.flush()
    else:
        profile.logto_sub = logto_user_id
        profile.logto_org_id = logto_org_id
        profile.organisation_id = org.id
        profile.role = "manager"

    # 4. Update invite with onboarding details + link org
    invite.status = AgencyInviteStatus.ACCEPTED
    invite.accepted_at = datetime.now(timezone.utc)
    invite.agency_name = agency_name
    invite.agency_phone = body.agency_phone
    invite.agency_contact_email = body.agency_contact_email
    invite.agency_country = body.agency_country
    invite.agency_currency = body.agency_currency
    invite.agency_address = body.agency_address
    invite.organisation_id = org.id
    await db.flush()

    # 5. Send welcome email
    s = get_settings()
    await logto_service.send_agency_manager_welcome_email(
        email=invite.manager_email,
        first_name=body.manager_first_name,
        agency_name=agency_name,
        temp_password=temp_password,
        frontend_url=s.frontend_url,
        db=db,
    )

    log.info(
        "agency.onboarding_complete",
        agency=agency_name, org_id=str(org.id), manager_email=invite.manager_email
    )
    return CompleteAgencyOnboardingResponse(
        message="Agency created. Check your email for login details."
    )


async def list_agency_invites(*, db: AsyncSession) -> list[AgencyInviteOut]:
    result = await db.execute(
        select(AgencyInvite).order_by(AgencyInvite.created_at.desc())
    )
    return [_to_out(inv) for inv in result.scalars()]


async def resend_agency_invite(*, db: AsyncSession, invite_id: uuid.UUID) -> AgencyInviteOut:
    """
    Resend the onboarding email for a pending agency invite.
    Extends expiry by 14 days and re-sends the onboarding URL.
    """
    from fastapi import HTTPException, status as http_status

    result = await db.execute(select(AgencyInvite).where(AgencyInvite.id == invite_id))
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Invite not found")
    if invite.status != AgencyInviteStatus.PENDING:
        raise HTTPException(
            status_code=http_status.HTTP_409_CONFLICT,
            detail=f"Cannot resend a {invite.status} invite",
        )

    invite.expires_at = datetime.now(timezone.utc) + timedelta(days=14)
    await db.flush()

    s = get_settings()
    onboarding_url = f"{s.frontend_url}/onboarding/agency/{invite.token}"
    await _send_agency_invite_email(
        email=invite.manager_email,
        first_name=invite.manager_first_name,
        agency_name=invite.agency_name,
        onboarding_url=onboarding_url,
        db=db,
    )
    log.info("agency_invite.resent", invite_id=str(invite.id), email=invite.manager_email)
    return _to_out(invite)


async def revoke_agency_invite(*, db: AsyncSession, invite_id: uuid.UUID) -> None:
    from fastapi import HTTPException, status as http_status

    result = await db.execute(select(AgencyInvite).where(AgencyInvite.id == invite_id))
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Invite not found")
    invite.status = AgencyInviteStatus.REVOKED
    await db.flush()


async def _send_agency_invite_email(
    *, email: str, first_name: str, agency_name: str, onboarding_url: str, db
) -> None:
    from app.services.settings_service import get_email_provider_from_db

    subject = f"You're invited to set up {agency_name} on Crib"
    body = (
        f"Hi {first_name},\n\n"
        f"You have been invited to onboard {agency_name} onto Crib.\n\n"
        "Click the link below to complete your agency setup:\n"
        f"{onboarding_url}\n\n"
        "This link expires in 14 days.\n\n"
        "— The Crib Team"
    )
    provider = await get_email_provider_from_db(db)
    result = await provider.send(
        recipient_name=first_name,
        recipient_email=email,
        recipient_phone=None,
        subject=subject,
        body=body,
    )
    if result.success:
        log.info("agency_invite.email_sent", email=email)
    else:
        log.warning("agency_invite.email_failed", email=email, reason=result.failure_reason)


def _to_out(invite: AgencyInvite) -> AgencyInviteOut:
    return AgencyInviteOut(
        id=str(invite.id),
        agency_name=invite.agency_name,
        manager_email=invite.manager_email,
        manager_first_name=invite.manager_first_name,
        manager_last_name=invite.manager_last_name,
        status=invite.status,
        token=invite.token,
        expires_at=invite.expires_at.isoformat(),
        created_at=invite.created_at.isoformat(),
    )
