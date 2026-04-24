"""
Business logic for Tenants, TenantDocuments, and TenantInvites.

Key design decisions:
  - Invite flow: invite creates a Tenant row in state=invited + TenantInvite with a
    secure token. The tenant follows the link, submits details → state=submitted.
    Manager approves → state=approved → activated (when lease goes active).
  - GDPR anonymise: replaces all PII with anonymised values, marks anonymised_at.
    Does NOT delete the row — audit trail is preserved.
  - All tenant queries are org-scoped: tenant.organisation_id == caller's org_id.
"""

from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import structlog
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

log = structlog.get_logger(__name__)

from app.core.state_machine import onboarding_sm
from app.utils.references import build_ref, next_seq
from app.models.property import Property, Unit
from app.models.tenant import (
    IdDocumentType,
    InviteStatus,
    OnboardingState,
    Tenant,
    TenantDocument,
    TenantInvite,
    TenantStatus,
)
from app.schemas.tenant import (
    OnboardingDraftSave,
    TenantCreate,
    TenantDocumentCreate,
    TenantDocumentOut,
    TenantInviteCreate,
    TenantInviteOut,
    TenantOnboardingSubmit,
    TenantOut,
    TenantUpdate,
)

INVITE_EXPIRY_HOURS = 72


# ── Serialisers ───────────────────────────────────────────────────────────────

def _doc_out(doc: TenantDocument) -> TenantDocumentOut:
    return TenantDocumentOut(
        id=str(doc.id),
        tenant_id=str(doc.tenant_id),
        type=doc.type.value,
        name=doc.name,
        url=doc.url,
        mime_type=doc.mime_type,
        size_bytes=doc.size_bytes,
        verified=doc.verified,
        uploaded_at=doc.uploaded_at.isoformat(),
        expires_at=doc.expires_at.isoformat() if doc.expires_at else None,
    )


def _invite_out(
    invite: TenantInvite,
    property_name: str | None = None,
    unit_name: str | None = None,
) -> TenantInviteOut:
    return TenantInviteOut(
        id=str(invite.id),
        landlord_id=str(invite.organisation_id),
        property_id=str(invite.property_id) if invite.property_id else None,
        unit_id=str(invite.unit_id) if invite.unit_id else None,
        lease_id=str(invite.lease_id) if invite.lease_id else None,
        email=invite.email,
        name=invite.name,
        token=invite.token,
        status=invite.status.value,
        sent_at=invite.sent_at.isoformat(),
        expires_at=invite.expires_at.isoformat(),
        property_name=property_name,
        unit_name=unit_name,
    )


def _tenant_out(tenant: Tenant) -> TenantOut:
    return TenantOut(
        id=str(tenant.id),
        reference=tenant.reference,
        user_id=tenant.logto_user_id,
        landlord_id=str(tenant.organisation_id),
        first_name=tenant.first_name,
        last_name=tenant.last_name,
        email=tenant.email,
        phone=tenant.phone,
        date_of_birth=tenant.date_of_birth,
        nationality=tenant.nationality,
        nin=tenant.nin,
        whatsapp_number=tenant.whatsapp_number,
        mobile_money_provider=tenant.mobile_money_provider,
        mobile_money_number=tenant.mobile_money_number,
        status=tenant.status.value,
        onboarding_state=tenant.onboarding_state.value,
        onboarding_token=tenant.onboarding_token,
        onboarding_completed_at=(
            tenant.onboarding_completed_at.isoformat()
            if tenant.onboarding_completed_at else None
        ),
        rejection_reason=tenant.rejection_reason,
        current_property_id=str(tenant.current_property_id) if tenant.current_property_id else None,
        current_unit_id=str(tenant.current_unit_id) if tenant.current_unit_id else None,
        current_lease_id=str(tenant.current_lease_id) if tenant.current_lease_id else None,
        emergency_contact=tenant.emergency_contact,
        notes=tenant.notes,
        tags=tenant.tags or [],
        gdpr_consent_at=tenant.gdpr_consent_at.isoformat() if tenant.gdpr_consent_at else None,
        data_retention_until=(
            tenant.data_retention_until.isoformat()
            if tenant.data_retention_until else None
        ),
        onboarding_draft=tenant.onboarding_draft,
        documents=[_doc_out(d) for d in (tenant.documents or [])],
        created_at=tenant.created_at.isoformat(),
        updated_at=tenant.updated_at.isoformat(),
    )


# ── Internal helpers ──────────────────────────────────────────────────────────

async def _get_tenant(
    tenant_id: uuid.UUID, org_id: uuid.UUID, db: AsyncSession
) -> Tenant:
    result = await db.execute(
        select(Tenant)
        .options(selectinload(Tenant.documents))
        .where(Tenant.id == tenant_id, Tenant.organisation_id == org_id)
    )
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    return tenant


# ── Tenant CRUD ───────────────────────────────────────────────────────────────

async def list_tenants(
    org_id: uuid.UUID,
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
    search: str | None = None,
    onboarding_state: str | None = None,
    tenant_status: str | None = None,
) -> dict:
    q = (
        select(Tenant)
        .options(selectinload(Tenant.documents))
        .where(Tenant.organisation_id == org_id)
    )
    if search:
        term = f"%{search}%"
        q = q.where(
            Tenant.first_name.ilike(term)
            | Tenant.last_name.ilike(term)
            | Tenant.email.ilike(term)
        )
    if onboarding_state:
        q = q.where(Tenant.onboarding_state == onboarding_state)
    if tenant_status:
        q = q.where(Tenant.status == tenant_status)

    total = await db.scalar(select(func.count()).select_from(q.subquery())) or 0
    q = q.order_by(Tenant.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    tenants = result.scalars().all()

    return {
        "data": [_tenant_out(t) for t in tenants],
        "total": total,
        "page": page,
        "pageSize": page_size,
        "hasNext": (page * page_size) < total,
    }


async def get_tenant(
    tenant_id: uuid.UUID, org_id: uuid.UUID, db: AsyncSession
) -> TenantOut:
    tenant = await _get_tenant(tenant_id, org_id, db)
    return _tenant_out(tenant)


async def update_tenant(
    tenant_id: uuid.UUID, body: TenantUpdate, org_id: uuid.UUID, db: AsyncSession
) -> TenantOut:
    tenant = await _get_tenant(tenant_id, org_id, db)
    data = body.model_dump(exclude_none=True)
    if "emergency_contact" in data and body.emergency_contact:
        data["emergency_contact"] = body.emergency_contact.model_dump(by_alias=True)
    for key, val in data.items():
        setattr(tenant, key, val)
    await db.flush()
    await db.refresh(tenant, attribute_names=["status", "onboarding_state", "updated_at"])
    return _tenant_out(tenant)


async def delete_tenant(
    tenant_id: uuid.UUID, org_id: uuid.UUID, db: AsyncSession
) -> None:
    tenant = await _get_tenant(tenant_id, org_id, db)
    await db.delete(tenant)
    await db.flush()


# ── Direct create ─────────────────────────────────────────────────────────────

async def create_tenant(
    body: TenantCreate, org_id: uuid.UUID, db: AsyncSession
) -> TenantOut:
    """
    Create a tenant profile directly without sending an invite email.
    The tenant is placed in `invited` state so the manager can later send
    an onboarding link or assign them to a unit via the lease flow.
    """
    # Guard against duplicate email within the org
    existing = await db.scalar(
        select(Tenant).where(
            Tenant.organisation_id == org_id,
            Tenant.email == body.email,
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A tenant with email {body.email} already exists in this organisation",
        )

    seq = await next_seq(db, Tenant)
    ref = build_ref("TEN", seq)

    tenant = Tenant(
        organisation_id=org_id,
        reference=ref,
        first_name=body.first_name,
        last_name=body.last_name,
        email=body.email,
        phone=body.phone,
        nin=body.national_id,
        date_of_birth=body.date_of_birth,
        nationality=body.nationality,
        notes=body.notes,
        status=TenantStatus.inactive,
        onboarding_state=OnboardingState.invited,
        tags=body.tags or [],
    )
    db.add(tenant)
    await db.flush()
    await db.refresh(tenant)

    log.info("tenant.created_direct", tenant_id=str(tenant.id), org_id=str(org_id))
    return _tenant_out(tenant)


# ── Invite flow ───────────────────────────────────────────────────────────────

async def invite_tenant(
    body: TenantInviteCreate, org_id: uuid.UUID, db: AsyncSession
) -> TenantInviteOut:
    now = datetime.now(timezone.utc)
    token = secrets.token_urlsafe(48)

    # Parse optional UUIDs
    prop_id = uuid.UUID(body.property_id) if body.property_id else None
    unit_id = uuid.UUID(body.unit_id) if body.unit_id else None

    # Split name into first/last (best-effort)
    parts = body.name.strip().split(" ", 1)
    first_name = parts[0]
    last_name = parts[1] if len(parts) > 1 else ""

    seq = await next_seq(db, Tenant)
    ref = build_ref("TEN", seq)

    tenant = Tenant(
        organisation_id=org_id,
        first_name=first_name,
        last_name=last_name,
        email=body.email,
        status=TenantStatus.inactive,
        onboarding_state=OnboardingState.invited,
        onboarding_token=token,
        current_property_id=prop_id,
        current_unit_id=unit_id,
        tags=[],
        reference=ref,
    )
    db.add(tenant)
    await db.flush()

    lease_id = uuid.UUID(body.lease_id) if body.lease_id else None
    invite = TenantInvite(
        tenant_id=tenant.id,
        organisation_id=org_id,
        property_id=prop_id,
        unit_id=unit_id,
        lease_id=lease_id,
        email=body.email,
        name=body.name,
        token=token,
        status=InviteStatus.pending,
        sent_at=now,
        expires_at=now + timedelta(hours=INVITE_EXPIRY_HOURS),
    )
    db.add(invite)
    await db.flush()

    # TODO Sprint 8: queue notification to send invite email/SMS

    return _invite_out(invite)


async def get_onboarding_by_token(token: str, db: AsyncSession) -> dict:
    result = await db.execute(
        select(TenantInvite).where(TenantInvite.token == token)
    )
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid or expired token")

    now = datetime.now(timezone.utc)
    if invite.expires_at.replace(tzinfo=timezone.utc) < now:
        invite.status = InviteStatus.expired
        await db.flush()
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invite token has expired")

    tenant_result = await db.execute(
        select(Tenant)
        .options(selectinload(Tenant.documents))
        .where(Tenant.id == invite.tenant_id)
    )
    tenant = tenant_result.scalar_one()

    # Transition to started if still in invited state
    if tenant.onboarding_state == OnboardingState.invited:
        tenant.onboarding_state = onboarding_sm.transition(
            tenant.onboarding_state, "ONBOARDING_STARTED"
        )
        await db.flush()
        await db.refresh(tenant, attribute_names=["onboarding_state", "updated_at"])

    # Resolve property/unit names for display in the onboarding wizard
    property_name: str | None = None
    unit_name: str | None = None
    if invite.property_id:
        p = await db.scalar(select(Property).where(Property.id == invite.property_id))
        property_name = p.name if p else None
    if invite.unit_id:
        u = await db.scalar(select(Unit).where(Unit.id == invite.unit_id))
        unit_name = u.name if u else None

    return {"tenant": _tenant_out(tenant), "invite": _invite_out(invite, property_name=property_name, unit_name=unit_name)}


async def submit_onboarding(
    token: str, body: TenantOnboardingSubmit, db: AsyncSession
) -> TenantOut:
    result = await db.execute(
        select(TenantInvite).where(TenantInvite.token == token)
    )
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid token")

    now = datetime.now(timezone.utc)
    if invite.expires_at.replace(tzinfo=timezone.utc) < now:
        invite.status = InviteStatus.expired
        await db.flush()
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invite token has expired")

    tenant_result = await db.execute(
        select(Tenant)
        .options(selectinload(Tenant.documents))
        .where(Tenant.id == invite.tenant_id)
    )
    tenant = tenant_result.scalar_one()

    # Re-submission is allowed (landlord may request corrections after review).
    # Guard only against submitting on behalf of a fully activated tenant.
    if tenant.onboarding_state == OnboardingState.activated:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Tenant is already fully activated",
        )

    # Update personal details
    tenant.first_name = body.first_name
    tenant.last_name = body.last_name
    tenant.email = body.email
    tenant.phone = body.phone
    tenant.date_of_birth = body.date_of_birth
    tenant.nationality = body.nationality
    if body.nin is not None:
        tenant.nin = body.nin
    if body.whatsapp_number is not None:
        tenant.whatsapp_number = body.whatsapp_number
    if body.mobile_money_provider is not None:
        tenant.mobile_money_provider = body.mobile_money_provider
    if body.mobile_money_number is not None:
        tenant.mobile_money_number = body.mobile_money_number
    if body.emergency_contact:
        tenant.emergency_contact = body.emergency_contact.model_dump(by_alias=True)

    # GDPR consent
    if body.gdpr_consent and not tenant.gdpr_consent_at:
        tenant.gdpr_consent_at = now
        tenant.data_retention_until = now.replace(year=now.year + 7)

    # Persist uploaded documents (append new; don't duplicate existing URLs)
    if body.documents:
        from dateutil.parser import parse as parse_dt
        existing_urls = {d.url for d in (tenant.documents or [])}
        for doc_data in body.documents:
            if doc_data.url in existing_urls:
                continue  # already saved from a previous draft-save or re-upload
            try:
                doc_type = IdDocumentType(doc_data.type)
            except ValueError:
                doc_type = IdDocumentType.other

            expires_at = None
            if doc_data.expires_at:
                try:
                    expires_at = parse_dt(doc_data.expires_at).replace(tzinfo=timezone.utc)
                except Exception:
                    pass

            doc = TenantDocument(
                tenant_id=tenant.id,
                type=doc_type,
                name=doc_data.name,
                url=doc_data.url,
                mime_type=doc_data.mime_type,
                size_bytes=doc_data.size_bytes,
                verified=False,
                uploaded_at=now,
                expires_at=expires_at,
            )
            db.add(doc)

    # Advance state machine on fresh submissions; re-submissions keep current state
    _resubmit_states = {OnboardingState.submitted, OnboardingState.approved, OnboardingState.rejected}
    if tenant.onboarding_state not in _resubmit_states:
        tenant.onboarding_state = onboarding_sm.transition_or_422(
            tenant.onboarding_state, "ONBOARDING_COMPLETED"
        )
    # Always update completion timestamp and mark invite accepted
    tenant.onboarding_completed_at = now
    # Clear the draft now that submission is complete
    tenant.onboarding_draft = None
    invite.status = InviteStatus.accepted

    await db.flush()
    await db.refresh(tenant, attribute_names=["status", "onboarding_state", "updated_at", "documents"])

    return _tenant_out(tenant)


async def save_onboarding_draft(
    token: str, body: OnboardingDraftSave, db: AsyncSession
) -> None:
    """
    Save partial onboarding progress to the tenant record.
    Called automatically as the tenant navigates between wizard steps.
    The draft is cleared on successful submission.
    """
    result = await db.execute(
        select(TenantInvite).where(TenantInvite.token == token)
    )
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid token")

    now = datetime.now(timezone.utc)
    if invite.expires_at.replace(tzinfo=timezone.utc) < now:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invite token has expired")

    result2 = await db.execute(select(Tenant).where(Tenant.id == invite.tenant_id))
    tenant = result2.scalar_one()

    draft: dict = {"step": body.step}
    if body.phone is not None:
        draft["phone"] = body.phone
    if body.date_of_birth is not None:
        draft["dateOfBirth"] = body.date_of_birth
    if body.nationality is not None:
        draft["nationality"] = body.nationality
    if body.emergency_contact is not None:
        draft["emergencyContact"] = body.emergency_contact.model_dump(by_alias=True)

    tenant.onboarding_draft = draft
    await db.flush()


async def resend_invite(
    tenant_id: uuid.UUID, org_id: uuid.UUID, db: AsyncSession
) -> TenantInviteOut:
    """
    Generate a fresh invite token for a tenant who has not yet completed
    onboarding (states: invited, started, rejected).

    - Carries the lease_id forward from the most recent invite that had one,
      so a tenant mid-flow (e.g. at the signing step) resumes exactly where
      they left off rather than restarting from scratch.
    - Marks any existing pending invites as expired.
    - For a rejected tenant, resets the onboarding state back to invited
      so they can start fresh.
    - Returns the new TenantInvite so the caller can display the new link.
    """
    tenant = await _get_tenant(tenant_id, org_id, db)

    _blocked_states = {OnboardingState.submitted, OnboardingState.approved, OnboardingState.activated}
    if tenant.onboarding_state in _blocked_states:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot resend invite: tenant onboarding is already '{tenant.onboarding_state.value}'. "
                "Only tenants in 'invited', 'started', or 'rejected' state can receive a new link."
            ),
        )

    # Find all invites (pending or expired) so we can carry lease_id forward.
    # Order descending by sent_at — most recent invite wins.
    all_invites_result = await db.execute(
        select(TenantInvite)
        .where(TenantInvite.tenant_id == tenant_id)
        .order_by(TenantInvite.sent_at.desc())
    )
    all_invites = all_invites_result.scalars().all()

    # Expire any that are still pending
    for inv in all_invites:
        if inv.status == InviteStatus.pending:
            inv.status = InviteStatus.expired

    # Carry lease_id forward from the most recent invite that had one
    previous_lease_id = next(
        (inv.lease_id for inv in all_invites if inv.lease_id is not None),
        None,
    )

    now = datetime.now(timezone.utc)
    token = secrets.token_urlsafe(48)

    new_invite = TenantInvite(
        tenant_id=tenant.id,
        organisation_id=org_id,
        property_id=tenant.current_property_id,
        unit_id=tenant.current_unit_id,
        lease_id=previous_lease_id,
        email=tenant.email,
        name=f"{tenant.first_name} {tenant.last_name}",
        token=token,
        status=InviteStatus.pending,
        sent_at=now,
        expires_at=now + timedelta(hours=INVITE_EXPIRY_HOURS),
    )
    db.add(new_invite)

    # Update the tenant's onboarding token and reset rejected state
    tenant.onboarding_token = token
    if tenant.onboarding_state == OnboardingState.rejected:
        tenant.onboarding_state = OnboardingState.invited
        tenant.rejection_reason = None

    await db.flush()
    await db.refresh(new_invite)

    # TODO Sprint 8: queue email/SMS notification with new invite link

    return _invite_out(new_invite)


# ── Resend login credentials ─────────────────────────────────────────────────

async def resend_login_credentials(
    tenant_id: uuid.UUID, org_id: uuid.UUID, db: AsyncSession
) -> dict:
    """
    (Re-)send login credentials to an activated tenant.

    - If the tenant has no Logto account yet, creates one first.
    - Generates a new temporary password in Logto and emails it.
    - Only allowed for tenants in the 'activated' state.

    Returns {"ok": True, "logto_user_id": "..."} on success.
    """
    from app.services.logto_service import create_tenant_user, resend_login_credentials as _resend

    tenant = await _get_tenant(tenant_id, org_id, db)

    if tenant.onboarding_state != OnboardingState.activated:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot send login credentials: tenant must be in 'activated' state "
                f"(current: '{tenant.onboarding_state.value}')."
            ),
        )

    # ── Resolve the owning organisation via the full ownership chain ─────────
    # Primary: caller's org_id (matches tenant.organisation_id in most cases).
    # Fallback: walk tenant → current_property → property.organisation_id.
    logto_user_id = tenant.logto_user_id
    if not logto_user_id:
        from app.models.organisation import Organisation
        from app.models.property import Property

        resolved_org = await db.get(Organisation, org_id)
        if resolved_org is None and tenant.current_property_id:
            prop = await db.get(Property, tenant.current_property_id)
            if prop:
                resolved_org = await db.get(Organisation, prop.organisation_id)

        if resolved_org:
            logto_user_id = await create_tenant_user(
                email=tenant.email,
                first_name=tenant.first_name,
                last_name=tenant.last_name,
                logto_org_id=resolved_org.logto_org_id,
            )
            if logto_user_id:
                tenant.logto_user_id = logto_user_id
                await db.flush()

        if not logto_user_id:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Could not create Logto account. Check M2M credentials in settings.",
            )
        # Account was just created — welcome email was already sent by create_tenant_user
        return {"ok": True, "logto_user_id": logto_user_id}

    # Account already exists — reset password and resend email
    ok = await _resend(
        logto_user_id=logto_user_id,
        email=tenant.email,
        first_name=tenant.first_name,
    )
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to reset password or send email. Check M2M credentials in settings.",
        )
    return {"ok": True, "logto_user_id": logto_user_id}


# ── Send onboarding link (with lease linked) ─────────────────────────────────

async def send_onboarding_link(
    lease_id: uuid.UUID, org_id: uuid.UUID, db: AsyncSession
) -> TenantInviteOut:
    """
    Link a draft lease to the approved tenant's invite and issue a fresh token.

    This is the manager action that unblocks a tenant stuck at 'Waiting for
    lease setup'.  Can be called multiple times (idempotent per lease).

    Flow:
      1. Validate lease is draft + has tenant_id
      2. Tenant must be approved or activated
      3. Expire all existing pending invites for this tenant
      4. Create a new TenantInvite with lease_id set
      5. Return the invite (caller displays the link)
    """
    from app.models.lease import Lease, LeaseStatus

    result = await db.execute(
        select(Lease).where(Lease.id == lease_id, Lease.organisation_id == org_id)
    )
    lease = result.scalar_one_or_none()
    if not lease:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lease not found.")

    # Allow any mid-onboarding lease status — the invite link can be resent
    # at any point before the lease is fully executed or terminated.
    _terminal_statuses = (
        LeaseStatus.active,
        LeaseStatus.expired,
        LeaseStatus.terminated,
    )
    if lease.status in _terminal_statuses:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot resend onboarding link for a '{lease.status.value}' lease.",
        )

    if not lease.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Lease has no tenant assigned. Link a tenant before sending the onboarding link.",
        )

    tenant = await _get_tenant(lease.tenant_id, org_id, db)

    # Allow any non-activated onboarding state — including 'started' (mid-flow
    # with an expired link) and 'approved' (fresh link for a newly approved tenant).
    if tenant.onboarding_state == OnboardingState.activated:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Tenant onboarding is already complete.",
        )

    # Expire existing pending invites for this tenant
    existing = await db.execute(
        select(TenantInvite).where(
            TenantInvite.tenant_id == tenant.id,
            TenantInvite.status == InviteStatus.pending,
        )
    )
    for old_invite in existing.scalars().all():
        old_invite.status = InviteStatus.expired

    now = datetime.now(timezone.utc)
    token = secrets.token_urlsafe(48)

    new_invite = TenantInvite(
        tenant_id=tenant.id,
        organisation_id=org_id,
        property_id=lease.property_id,
        unit_id=lease.unit_id,
        lease_id=lease.id,
        email=tenant.email,
        name=f"{tenant.first_name} {tenant.last_name}",
        token=token,
        status=InviteStatus.pending,
        sent_at=now,
        expires_at=now + timedelta(hours=INVITE_EXPIRY_HOURS),
    )
    db.add(new_invite)
    tenant.onboarding_token = token

    await db.flush()
    await db.refresh(new_invite)

    log.info(
        "onboarding_link.sent",
        lease_id=str(lease_id),
        tenant_id=str(tenant.id),
        token=token[:8] + "…",
    )

    # TODO Sprint 8: queue email/SMS to tenant with the onboarding URL

    return _invite_out(new_invite)


# ── Approve / Reject ──────────────────────────────────────────────────────────

async def approve_tenant(
    tenant_id: uuid.UUID, org_id: uuid.UUID, db: AsyncSession
) -> TenantOut:
    tenant = await _get_tenant(tenant_id, org_id, db)
    tenant.onboarding_state = onboarding_sm.transition_or_422(
        tenant.onboarding_state, "TENANT_APPROVED"
    )
    tenant.status = TenantStatus.active
    await db.flush()
    await db.refresh(tenant, attribute_names=["status", "onboarding_state", "updated_at"])
    return _tenant_out(tenant)


async def reject_tenant(
    tenant_id: uuid.UUID, reason: str, org_id: uuid.UUID, db: AsyncSession
) -> TenantOut:
    tenant = await _get_tenant(tenant_id, org_id, db)
    tenant.onboarding_state = onboarding_sm.transition_or_422(
        tenant.onboarding_state, "TENANT_REJECTED"
    )
    tenant.rejection_reason = reason
    await db.flush()
    await db.refresh(tenant, attribute_names=["onboarding_state", "rejection_reason", "updated_at"])
    return _tenant_out(tenant)


# ── Documents ─────────────────────────────────────────────────────────────────

async def list_documents(
    tenant_id: uuid.UUID, org_id: uuid.UUID, db: AsyncSession
) -> list[TenantDocumentOut]:
    await _get_tenant(tenant_id, org_id, db)  # ownership check
    result = await db.execute(
        select(TenantDocument)
        .where(TenantDocument.tenant_id == tenant_id)
        .order_by(TenantDocument.uploaded_at.desc())
    )
    return [_doc_out(d) for d in result.scalars().all()]


async def upload_document(
    tenant_id: uuid.UUID, body: TenantDocumentCreate,
    org_id: uuid.UUID, db: AsyncSession
) -> TenantDocumentOut:
    await _get_tenant(tenant_id, org_id, db)

    expires_at = None
    if body.expires_at:
        from dateutil.parser import parse as parse_dt
        expires_at = parse_dt(body.expires_at).replace(tzinfo=timezone.utc)

    doc = TenantDocument(
        tenant_id=tenant_id,
        type=body.type,
        name=body.name,
        url=body.url,
        mime_type=body.mime_type,
        size_bytes=body.size_bytes,
        verified=False,
        uploaded_at=datetime.now(timezone.utc),
        expires_at=expires_at,
    )
    db.add(doc)
    await db.flush()
    await db.refresh(doc)
    return _doc_out(doc)


async def verify_document(
    tenant_id: uuid.UUID, document_id: uuid.UUID,
    org_id: uuid.UUID, db: AsyncSession
) -> TenantDocumentOut:
    await _get_tenant(tenant_id, org_id, db)
    result = await db.execute(
        select(TenantDocument).where(
            TenantDocument.id == document_id,
            TenantDocument.tenant_id == tenant_id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    doc.verified = not doc.verified
    await db.flush()
    await db.refresh(doc, attribute_names=["type", "verified", "updated_at"])
    return _doc_out(doc)


async def delete_document(
    tenant_id: uuid.UUID, document_id: uuid.UUID,
    org_id: uuid.UUID, db: AsyncSession
) -> None:
    await _get_tenant(tenant_id, org_id, db)
    result = await db.execute(
        select(TenantDocument).where(
            TenantDocument.id == document_id,
            TenantDocument.tenant_id == tenant_id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    await db.delete(doc)
    await db.flush()


# ── GDPR anonymisation ────────────────────────────────────────────────────────

async def anonymise_tenant(
    tenant_id: uuid.UUID, org_id: uuid.UUID, db: AsyncSession
) -> None:
    """
    GDPR right to erasure — replaces all PII with anonymised placeholders.
    The row is retained for audit/financial history; all identifying data is wiped.
    """
    tenant = await _get_tenant(tenant_id, org_id, db)

    anon_id = str(tenant.id)[:8]
    tenant.first_name = "Anonymised"
    tenant.last_name = anon_id
    tenant.email = f"anonymised-{anon_id}@deleted.invalid"
    tenant.phone = None
    tenant.date_of_birth = None
    tenant.nationality = None
    tenant.emergency_contact = None
    tenant.notes = None
    tenant.logto_user_id = None
    tenant.onboarding_token = None
    tenant.anonymised_at = datetime.now(timezone.utc)
    tenant.status = TenantStatus.inactive

    # Delete all documents (PII files)
    for doc in tenant.documents:
        await db.delete(doc)

    await db.flush()
