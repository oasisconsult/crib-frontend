"""
Caretaker invite service.

Owner sends invite → caretaker fills onboarding form →
Logto user created (owner-level role for dashboard access) →
Profile row created with caretaker_* fields → welcome email sent.

Scoping model:
  profile.caretaker_owner_profile_id  = owner's profile ID
  profile.caretaker_property_ids      = list of delegated property UUID strings
  profile.caretaker_permission_level  = "full" | "operations_only"
  profile.role                        = "caretaker" (stored in our DB)

In deps.py, when profile.caretaker_owner_profile_id IS NOT NULL, the string
"caretaker" is appended to CurrentUser.roles so the application layer can
detect caretakers and apply property-scoped filtering without requiring a
separate Logto app role.
"""
from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.caretaker_invite import CaretakerInvite, CaretakerInviteStatus
from app.models.profile import Profile
from app.schemas.common import CamelModel

log = structlog.get_logger(__name__)

INVITE_EXPIRY_DAYS = 7


# ── Schemas ───────────────────────────────────────────────────────────────────


class CreateCaretakerInviteRequest(CamelModel):
    email:            str
    first_name:       str
    last_name:        str
    phone:            str | None = None
    property_ids:     list[str]
    permission_level: str = "full"   # "full" | "operations_only"


class CaretakerInviteOut(CamelModel):
    id:               str
    owner_profile_id: str
    email:            str
    first_name:       str
    last_name:        str
    phone:            str | None
    property_ids:     list[str]
    permission_level: str
    status:           str
    token:            str
    expires_at:       str
    created_at:       str
    accepted_at:      str | None = None


class ActiveCaretakerOut(CamelModel):
    """Active caretaker visible to the owner in Settings → Caretakers."""
    id:               str           # profile.id
    user_id:          str           # profile.id (alias for frontend)
    email:            str
    name:             str
    phone:            str | None
    property_ids:     list[str]
    permission_level: str
    created_at:       str
    deactivated_at:   str | None = None
    last_login_at:    str | None = None


class CaretakerOnboardingDetails(CamelModel):
    """Returned by GET /caretaker-invites/onboarding/{token} — public."""
    token:            str
    email:            str
    first_name:       str
    last_name:        str
    phone:            str | None
    owner_name:       str
    property_names:   list[str]
    permission_level: str
    expires_at:       str


class CompleteCaretakerOnboardingRequest(CamelModel):
    first_name: str
    last_name:  str
    phone:      str | None = None


class CompleteCaretakerOnboardingResponse(CamelModel):
    message: str


class UpdateCaretakerRequest(CamelModel):
    property_ids:     list[str] | None = None
    permission_level: str | None = None


# ── Helpers ───────────────────────────────────────────────────────────────────


def _invite_to_out(invite: CaretakerInvite) -> CaretakerInviteOut:
    return CaretakerInviteOut(
        id=str(invite.id),
        owner_profile_id=str(invite.owner_profile_id),
        email=invite.email,
        first_name=invite.first_name,
        last_name=invite.last_name,
        phone=invite.phone,
        property_ids=invite.property_ids or [],
        permission_level=invite.permission_level,
        status=invite.status,
        token=invite.token,
        expires_at=invite.expires_at.isoformat(),
        created_at=invite.created_at.isoformat(),  # type: ignore[union-attr]
        accepted_at=invite.accepted_at.isoformat() if invite.accepted_at else None,
    )


async def _owner_display_name(db: AsyncSession, owner_profile_id: uuid.UUID) -> str:
    result = await db.execute(
        select(Profile).where(Profile.id == owner_profile_id)
    )
    owner = result.scalar_one_or_none()
    if not owner:
        return "Your landlord"
    return owner.display_name or (owner.email or "").split("@")[0] or "Your landlord"


async def _property_names(db: AsyncSession, property_ids: list[str]) -> list[str]:
    """Fetch property names for the listed UUIDs."""
    if not property_ids:
        return []
    try:
        from app.models.property import Property
        uuids = [uuid.UUID(pid) for pid in property_ids]
        result = await db.execute(
            select(Property.name).where(Property.id.in_(uuids))
        )
        return [row[0] for row in result.fetchall()]
    except Exception:
        return []


# ── Service functions ─────────────────────────────────────────────────────────


async def create_caretaker_invite(
    *,
    db: AsyncSession,
    owner_profile_id: uuid.UUID,
    body: CreateCaretakerInviteRequest,
) -> CaretakerInviteOut:
    from fastapi import HTTPException, status as http_status

    if not body.property_ids:
        raise HTTPException(
            status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one property must be selected.",
        )

    # ── Subscription enforcement: caretakers count as team members ────────────
    owner_result = await db.execute(
        select(Profile).where(Profile.id == owner_profile_id)
    )
    owner_for_limit = owner_result.scalar_one_or_none()
    if owner_for_limit and owner_for_limit.organisation_id:
        from app.services.subscription_limits import check_user_limit
        await check_user_limit(owner_for_limit.organisation_id, db)

    if body.permission_level not in ("full", "operations_only"):
        raise HTTPException(
            status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="permission_level must be 'full' or 'operations_only'.",
        )

    # Prevent duplicate pending invites for the same email from the same owner
    existing = await db.execute(
        select(CaretakerInvite).where(
            CaretakerInvite.owner_profile_id == owner_profile_id,
            CaretakerInvite.email == body.email,
            CaretakerInvite.status == CaretakerInviteStatus.PENDING,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=http_status.HTTP_409_CONFLICT,
            detail=(
                f"A pending caretaker invite already exists for {body.email}. "
                "Resend the existing invite or revoke it first."
            ),
        )

    invite = CaretakerInvite(
        owner_profile_id=owner_profile_id,
        email=body.email,
        first_name=body.first_name,
        last_name=body.last_name,
        phone=body.phone,
        property_ids=body.property_ids,
        permission_level=body.permission_level,
        token=secrets.token_urlsafe(48),
        status=CaretakerInviteStatus.PENDING,
        expires_at=datetime.now(timezone.utc) + timedelta(days=INVITE_EXPIRY_DAYS),
    )
    db.add(invite)
    await db.flush()

    # Send invitation email
    s = get_settings()
    onboarding_url = f"{s.frontend_url}/onboarding/caretaker/{invite.token}"
    owner_name = await _owner_display_name(db, owner_profile_id)
    prop_names = await _property_names(db, body.property_ids)
    await _send_caretaker_invite_email(
        email=body.email,
        first_name=body.first_name,
        owner_name=owner_name,
        property_names=prop_names,
        onboarding_url=onboarding_url,
    )

    log.info(
        "caretaker_invite.created",
        invite_id=str(invite.id),
        email=body.email,
        owner=str(owner_profile_id),
    )
    return _invite_to_out(invite)


async def list_caretaker_invites(
    *, db: AsyncSession, owner_profile_id: uuid.UUID
) -> list[CaretakerInviteOut]:
    result = await db.execute(
        select(CaretakerInvite)
        .where(CaretakerInvite.owner_profile_id == owner_profile_id)
        .order_by(CaretakerInvite.created_at.desc())
    )
    return [_invite_to_out(inv) for inv in result.scalars()]


async def revoke_caretaker_invite(
    *, db: AsyncSession, invite_id: uuid.UUID, owner_profile_id: uuid.UUID
) -> None:
    from fastapi import HTTPException, status as http_status

    result = await db.execute(
        select(CaretakerInvite).where(CaretakerInvite.id == invite_id)
    )
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Invite not found")
    if invite.owner_profile_id != owner_profile_id:
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Not your invite")
    if invite.status != CaretakerInviteStatus.PENDING:
        raise HTTPException(
            status_code=http_status.HTTP_409_CONFLICT,
            detail=f"Cannot revoke a {invite.status} invite",
        )
    invite.status = CaretakerInviteStatus.REVOKED
    await db.flush()


async def resend_caretaker_invite(
    *, db: AsyncSession, invite_id: uuid.UUID, owner_profile_id: uuid.UUID
) -> CaretakerInviteOut:
    from fastapi import HTTPException, status as http_status

    result = await db.execute(
        select(CaretakerInvite).where(CaretakerInvite.id == invite_id)
    )
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Invite not found")
    if invite.owner_profile_id != owner_profile_id:
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Not your invite")
    if invite.status != CaretakerInviteStatus.PENDING:
        raise HTTPException(
            status_code=http_status.HTTP_409_CONFLICT,
            detail=f"Cannot resend a {invite.status} invite",
        )

    invite.expires_at = datetime.now(timezone.utc) + timedelta(days=INVITE_EXPIRY_DAYS)
    await db.flush()

    s = get_settings()
    onboarding_url = f"{s.frontend_url}/onboarding/caretaker/{invite.token}"
    owner_name = await _owner_display_name(db, owner_profile_id)
    prop_names = await _property_names(db, invite.property_ids or [])
    await _send_caretaker_invite_email(
        email=invite.email,
        first_name=invite.first_name,
        owner_name=owner_name,
        property_names=prop_names,
        onboarding_url=onboarding_url,
    )
    log.info("caretaker_invite.resent", invite_id=str(invite.id))
    return _invite_to_out(invite)


# ── Public onboarding ─────────────────────────────────────────────────────────


async def get_caretaker_onboarding_details(
    *, db: AsyncSession, token: str
) -> CaretakerOnboardingDetails:
    from fastapi import HTTPException, status as http_status

    result = await db.execute(
        select(CaretakerInvite).where(CaretakerInvite.token == token)
    )
    invite = result.scalar_one_or_none()

    if not invite:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Invite not found")
    if invite.status != CaretakerInviteStatus.PENDING:
        raise HTTPException(
            status_code=http_status.HTTP_410_GONE,
            detail=f"Invite is {invite.status}",
        )
    if invite.expires_at < datetime.now(timezone.utc):
        invite.status = CaretakerInviteStatus.EXPIRED
        await db.flush()
        raise HTTPException(status_code=http_status.HTTP_410_GONE, detail="Invite has expired")

    owner_name = await _owner_display_name(db, invite.owner_profile_id)
    prop_names = await _property_names(db, invite.property_ids or [])

    return CaretakerOnboardingDetails(
        token=invite.token,
        email=invite.email,
        first_name=invite.first_name,
        last_name=invite.last_name,
        phone=invite.phone,
        owner_name=owner_name,
        property_names=prop_names,
        permission_level=invite.permission_level,
        expires_at=invite.expires_at.isoformat(),
    )


async def complete_caretaker_onboarding(
    *, db: AsyncSession, token: str, body: CompleteCaretakerOnboardingRequest
) -> CompleteCaretakerOnboardingResponse:
    """
    Complete caretaker onboarding:
      1. Validate token
      2. Create Logto user with owner-level app role (for dashboard access)
      3. Create Profile with caretaker_* delegation fields
      4. Mark invite accepted
      5. Send welcome email with login link
    """
    from fastapi import HTTPException, status as http_status
    from app.services import logto_service
    from app.services.logto_service import _generate_temp_password

    result = await db.execute(
        select(CaretakerInvite).where(CaretakerInvite.token == token)
    )
    invite = result.scalar_one_or_none()

    if not invite or invite.status != CaretakerInviteStatus.PENDING:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Invalid or expired invite",
        )
    if invite.expires_at < datetime.now(timezone.utc):
        invite.status = CaretakerInviteStatus.EXPIRED
        await db.flush()
        raise HTTPException(status_code=http_status.HTTP_410_GONE, detail="Invite has expired")

    # Fetch the owner's profile to inherit their organisation_id
    owner_result = await db.execute(
        select(Profile).where(Profile.id == invite.owner_profile_id)
    )
    owner = owner_result.scalar_one_or_none()
    if not owner:
        raise HTTPException(
            status_code=http_status.HTTP_409_CONFLICT,
            detail="The owner who sent this invite no longer exists.",
        )

    # Idempotency: if a profile already exists for this email, update it
    existing_result = await db.execute(
        select(Profile).where(Profile.email == invite.email)
    )
    existing_profile = existing_result.scalar_one_or_none()

    if existing_profile is not None and existing_profile.caretaker_owner_profile_id is not None:
        log.info("caretaker.onboarding_already_complete", email=invite.email)
        invite.status = CaretakerInviteStatus.ACCEPTED
        invite.accepted_at = datetime.now(timezone.utc)
        await db.flush()
        return CompleteCaretakerOnboardingResponse(
            message="Your caretaker account is already set up. Check your email for login details."
        )

    temp_password = _generate_temp_password()

    # Create Logto user with the 'caretaker' app role so the JWT carries the
    # correct role claim.  deps.py also injects 'owner' so they can access the
    # dashboard and pass is_owner_or_manager() guards without bypassing
    # property-level scoping.
    logto_user_id: str | None = None
    logto_org_id: str | None = owner.logto_org_id  # caretaker joins owner's org

    try:
        result_tuple = await logto_service.create_caretaker_user(
            email=invite.email,
            first_name=body.first_name,
            last_name=body.last_name,
            temp_password=temp_password,
            logto_org_id=logto_org_id,
        )
        if result_tuple:
            logto_user_id, _is_new = result_tuple
    except Exception as exc:
        log.warning("caretaker.logto_user_creation_failed", error=str(exc))
        logto_user_id = f"user_pending_{invite.id}"

    # Create or update the Profile
    if existing_profile is not None:
        existing_profile.logto_sub = logto_user_id or existing_profile.logto_sub
        existing_profile.logto_org_id = logto_org_id
        existing_profile.organisation_id = owner.organisation_id
        existing_profile.role = "caretaker"
        existing_profile.display_name = f"{body.first_name} {body.last_name}"
        existing_profile.phone = body.phone
        existing_profile.caretaker_owner_profile_id = invite.owner_profile_id
        existing_profile.caretaker_permission_level = invite.permission_level
        existing_profile.caretaker_property_ids = invite.property_ids or []
        profile = existing_profile
    else:
        profile = Profile(
            logto_sub=logto_user_id or f"user_pending_{invite.id}",
            logto_org_id=logto_org_id,
            organisation_id=owner.organisation_id,
            role="caretaker",
            display_name=f"{body.first_name} {body.last_name}",
            email=invite.email,
            phone=body.phone,
            is_read_only=False,
            caretaker_owner_profile_id=invite.owner_profile_id,
            caretaker_permission_level=invite.permission_level,
            caretaker_property_ids=invite.property_ids or [],
        )
        db.add(profile)

    await db.flush()

    # ── Grant property access ─────────────────────────────────────────────────
    # Create LandlordPropertyAccess rows so the property service can filter
    # caretaker-visible properties via the same JOIN used for read-only landlords.
    # We delete any stale rows first so this block is fully idempotent.
    from app.models.landlord_invite import LandlordPropertyAccess
    from sqlalchemy import delete as _delete
    await db.execute(
        _delete(LandlordPropertyAccess).where(
            LandlordPropertyAccess.landlord_profile_id == profile.id
        )
    )
    for pid_str in (invite.property_ids or []):
        try:
            prop_uuid = uuid.UUID(str(pid_str))
            db.add(LandlordPropertyAccess(
                landlord_profile_id=profile.id,
                property_id=prop_uuid,
                is_read_only=False,           # caretakers can manage, not just view
                granted_by_profile_id=invite.owner_profile_id,
            ))
        except (ValueError, Exception) as exc:
            log.warning("caretaker.invalid_property_id", pid=pid_str, error=str(exc))
    await db.flush()

    # Mark invite accepted
    invite.status = CaretakerInviteStatus.ACCEPTED
    invite.accepted_at = datetime.now(timezone.utc)
    await db.flush()

    # Send welcome email
    s = get_settings()
    owner_name = owner.display_name or (owner.email or "").split("@")[0] or "your landlord"
    await _send_caretaker_welcome_email(
        email=invite.email,
        first_name=body.first_name,
        owner_name=owner_name,
        temp_password=temp_password,
        frontend_url=s.frontend_url,
    )

    log.info(
        "caretaker.onboarding_complete",
        caretaker_email=invite.email,
        owner=str(invite.owner_profile_id),
        properties=len(invite.property_ids or []),
    )
    return CompleteCaretakerOnboardingResponse(
        message="Your caretaker account has been created. Check your email to log in."
    )


# ── Active caretaker management ───────────────────────────────────────────────


async def list_active_caretakers(
    *, db: AsyncSession, owner_profile_id: uuid.UUID
) -> list[ActiveCaretakerOut]:
    """Return all caretaker profiles delegated by this owner."""
    result = await db.execute(
        select(Profile).where(
            Profile.caretaker_owner_profile_id == owner_profile_id,
            Profile.deleted_at.is_(None),
        )
    )
    profiles = result.scalars().all()
    return [_profile_to_caretaker_out(p) for p in profiles]


def _profile_to_caretaker_out(p: Profile) -> ActiveCaretakerOut:
    name = p.display_name or (p.email or "").split("@")[0] or "Caretaker"
    return ActiveCaretakerOut(
        id=str(p.id),
        user_id=str(p.id),
        email=p.email or "",
        name=name,
        phone=p.phone,
        property_ids=p.caretaker_property_ids or [],
        permission_level=p.caretaker_permission_level or "full",
        created_at=p.created_at.isoformat(),  # type: ignore[union-attr]
        deactivated_at=p.deleted_at.isoformat() if p.deleted_at else None,
        last_login_at=p.last_seen_at.isoformat() if p.last_seen_at else None,
    )


async def update_caretaker(
    *,
    db: AsyncSession,
    caretaker_id: uuid.UUID,
    owner_profile_id: uuid.UUID,
    body: UpdateCaretakerRequest,
) -> ActiveCaretakerOut:
    from fastapi import HTTPException, status as http_status

    result = await db.execute(
        select(Profile).where(
            Profile.id == caretaker_id,
            Profile.caretaker_owner_profile_id == owner_profile_id,
        )
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND,
                            detail="Caretaker not found or not delegated by you")

    if body.property_ids is not None:
        profile.caretaker_property_ids = body.property_ids
        # Keep LandlordPropertyAccess in sync so property queries stay accurate.
        from app.models.landlord_invite import LandlordPropertyAccess
        from sqlalchemy import delete as _delete
        await db.execute(
            _delete(LandlordPropertyAccess).where(
                LandlordPropertyAccess.landlord_profile_id == profile.id
            )
        )
        for pid_str in body.property_ids:
            try:
                prop_uuid = uuid.UUID(str(pid_str))
                db.add(LandlordPropertyAccess(
                    landlord_profile_id=profile.id,
                    property_id=prop_uuid,
                    is_read_only=False,
                    granted_by_profile_id=owner_profile_id,
                ))
            except (ValueError, Exception) as exc:
                log.warning("caretaker.invalid_property_id_on_update", pid=pid_str, error=str(exc))

    if body.permission_level is not None:
        if body.permission_level not in ("full", "operations_only"):
            raise HTTPException(status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
                                detail="permission_level must be 'full' or 'operations_only'")
        profile.caretaker_permission_level = body.permission_level

    await db.flush()
    log.info("caretaker.updated", caretaker_id=str(caretaker_id))
    return _profile_to_caretaker_out(profile)


async def deactivate_caretaker(
    *,
    db: AsyncSession,
    caretaker_id: uuid.UUID,
    owner_profile_id: uuid.UUID,
) -> None:
    """
    Deactivate a caretaker — blocks their login (soft-delete).
    Account is preserved for audit trail; reactivation possible later.
    """
    from fastapi import HTTPException, status as http_status
    from app.services import logto_service

    result = await db.execute(
        select(Profile).where(
            Profile.id == caretaker_id,
            Profile.caretaker_owner_profile_id == owner_profile_id,
        )
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND,
                            detail="Caretaker not found or not delegated by you")

    profile.deleted_at = datetime.now(timezone.utc)
    await db.flush()

    # Suspend Logto account (blocks login immediately)
    if profile.logto_sub and not profile.logto_sub.startswith("user_pending_"):
        await logto_service.set_user_suspended(profile.logto_sub, suspended=True)

    log.info("caretaker.deactivated", caretaker_id=str(caretaker_id))


# ── Email helpers ─────────────────────────────────────────────────────────────


async def _send_caretaker_invite_email(
    *,
    email: str,
    first_name: str,
    owner_name: str,
    property_names: list[str],
    onboarding_url: str,
) -> None:
    from app.integrations.notifications.email import get_email_provider

    props_text = ", ".join(property_names) if property_names else "properties"
    subject = f"You've been invited to manage {props_text} on Crib"
    body = (
        f"Hi {first_name},\n\n"
        f"{owner_name} has invited you to manage their properties on Crib.\n\n"
        f"Properties: {props_text}\n\n"
        "Click the link below to set up your caretaker account:\n"
        f"{onboarding_url}\n\n"
        f"This link expires in {INVITE_EXPIRY_DAYS} days.\n\n"
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
        log.info("caretaker_invite.email_sent", email=email)
    else:
        log.warning("caretaker_invite.email_failed", email=email,
                    reason=result.failure_reason)


async def _send_caretaker_welcome_email(
    *,
    email: str,
    first_name: str,
    owner_name: str,
    temp_password: str,
    frontend_url: str,
) -> None:
    from app.integrations.notifications.email import get_email_provider

    subject = f"Welcome to Crib — you're now managing properties for {owner_name}"
    body = (
        f"Hi {first_name},\n\n"
        f"Your caretaker account has been created on Crib. "
        f"You can now log in to manage {owner_name}'s properties.\n\n"
        f"Login:     {frontend_url}/login\n"
        f"Email:     {email}\n"
        f"Password:  {temp_password}\n\n"
        "Please change your password after your first sign-in.\n\n"
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
        log.info("caretaker.welcome_email_sent", email=email)
    else:
        log.warning("caretaker.welcome_email_failed", email=email,
                    reason=result.failure_reason)
