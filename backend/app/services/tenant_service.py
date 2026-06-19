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
from app.utils.db_filters import org_scope
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
    tenant_id: uuid.UUID,
    org_id: uuid.UUID | None,
    db: AsyncSession,
    *,
    include_deleted: bool = False,
) -> Tenant:
    _filters = [Tenant.id == tenant_id]
    if org_id is not None:
        _filters.append(Tenant.organisation_id == org_id)
    if not include_deleted:
        _filters.append(Tenant.deleted_at.is_(None))
    result = await db.execute(
        select(Tenant)
        .options(selectinload(Tenant.documents))
        .where(*_filters)
    )
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    return tenant


# ── Tenant CRUD ───────────────────────────────────────────────────────────────

async def list_tenants(
    org_id: uuid.UUID | None,
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
    search: str | None = None,
    onboarding_state: str | None = None,
    tenant_status: str | None = None,
    include_anonymised: bool = False,
) -> dict:
    q = org_scope(
        select(Tenant).options(selectinload(Tenant.documents)),
        Tenant.organisation_id, org_id,
    )
    # Exclude soft-deleted tenants from all normal listings.
    q = q.where(Tenant.deleted_at.is_(None))
    # By default also exclude GDPR-anonymised tenants from dashboard lists.
    # Admins can pass include_anonymised=True to see the anonymised stubs.
    if not include_anonymised:
        q = q.where(Tenant.anonymised_at.is_(None))
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
    tenant_id: uuid.UUID, org_id: uuid.UUID | None, db: AsyncSession
) -> TenantOut:
    tenant = await _get_tenant(tenant_id, org_id, db)
    return _tenant_out(tenant)


async def update_tenant(
    tenant_id: uuid.UUID, body: TenantUpdate, org_id: uuid.UUID | None, db: AsyncSession
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
    tenant_id: uuid.UUID, org_id: uuid.UUID | None, db: AsyncSession
) -> None:
    """
    Soft-delete a tenant record.

    Marks the row as deleted (hidden from all normal queries) without removing it.
    PII fields are preserved; use anonymise_tenant() to execute a full GDPR erasure.

    Raises 400 if the tenant has an active lease — the lease must be terminated first.
    """
    tenant = await _get_tenant(tenant_id, org_id, db)

    if tenant.current_lease_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Cannot delete a tenant with an active lease. "
                "Terminate or expire the lease first."
            ),
        )

    now = datetime.now(timezone.utc)
    tenant.deleted_at = now
    tenant.status = TenantStatus.inactive
    await db.flush()

    # Audit log
    from app.models.gdpr import GdprRequest
    db.add(GdprRequest(
        subject_type="tenant",
        subject_id=tenant_id,
        request_type="soft_delete",
        completed_at=now,
        fields_cleared=[],
        notes="Soft-deleted by manager/owner. PII retained; call anonymise to erase.",
    ))
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
    await db.refresh(tenant, attribute_names=["status", "onboarding_state", "updated_at", "documents"])

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

    # Send invite email to tenant (non-fatal)
    await _send_tenant_invite_email(
        email=body.email,
        first_name=first_name,
        token=token,
        org_id=org_id,
        db=db,
    )

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
        log.info(
            "tenant.submit_onboarding.documents",
            tenant_id=str(tenant.id),
            received=len(body.documents),
            existing_count=len(existing_urls),
        )
        for doc_data in body.documents:
            if doc_data.url in existing_urls:
                log.info("tenant.submit_onboarding.doc_skipped", url=doc_data.url[:80])
                continue  # already saved from a previous draft-save or re-upload
            log.info("tenant.submit_onboarding.doc_added", name=doc_data.name, url=doc_data.url[:80])
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

    # Advance state machine.
    # - Fresh submission (invited/started): invited→started→submitted
    # - Resubmission after rejection: rejected→submitted (landlord can re-review)
    # - Resubmission when already submitted/approved: keep current state
    _keep_state = {OnboardingState.submitted, OnboardingState.approved}
    is_resubmission = tenant.onboarding_state == OnboardingState.rejected
    if is_resubmission:
        tenant.onboarding_state = onboarding_sm.transition_or_422(
            tenant.onboarding_state, "RESUBMITTED"
        )
    elif tenant.onboarding_state not in _keep_state:
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

    # Notify the landlord/manager that the tenant has resubmitted (non-fatal)
    if is_resubmission:
        await _notify_resubmission(tenant, invite.organisation_id, db)

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
    tenant_id: uuid.UUID, org_id: uuid.UUID | None, db: AsyncSession
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

    # Update the tenant's onboarding token.
    # For rejected tenants: keep the rejected state and rejection reason so the
    # tenant sees the feedback when they open the new link. The resubmission
    # itself (submit_onboarding) will move the state back to submitted.
    tenant.onboarding_token = token

    await db.flush()
    await db.refresh(new_invite)

    # TODO Sprint 8: queue email/SMS notification with new invite link

    return _invite_out(new_invite)


# ── Cancel invite ────────────────────────────────────────────────────────────

async def cancel_invite(
    tenant_id: uuid.UUID, org_id: uuid.UUID | None, db: AsyncSession
) -> None:
    """
    Cancel all pending invites for a tenant and reset their onboarding state
    back to invited so the invite can be re-sent later if needed.

    Only valid when the tenant is in an invited or started state.
    Submitted / approved / activated tenants cannot have their invite cancelled.
    """
    tenant = await _get_tenant(tenant_id, org_id, db)

    _blocked_states = {OnboardingState.submitted, OnboardingState.approved, OnboardingState.activated}
    if tenant.onboarding_state in _blocked_states:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot cancel invite for a tenant in '{tenant.onboarding_state}' state",
        )

    # Expire all pending invites
    invite_result = await db.execute(
        select(TenantInvite).where(
            TenantInvite.tenant_id == tenant_id,
            TenantInvite.status == InviteStatus.pending,
        )
    )
    for inv in invite_result.scalars():
        inv.status = InviteStatus.expired

    tenant.onboarding_token = None
    await db.flush()
    log.info("tenant.invite_cancelled", tenant_id=str(tenant_id))


# ── Resend login credentials ─────────────────────────────────────────────────

async def resend_login_credentials(
    tenant_id: uuid.UUID, org_id: uuid.UUID | None, db: AsyncSession
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
                db=db,
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
        db=db,
    )
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to reset password or send email. Check M2M credentials in settings.",
        )
    return {"ok": True, "logto_user_id": logto_user_id}


# ── Send onboarding link (with lease linked) ─────────────────────────────────

async def send_onboarding_link(
    lease_id: uuid.UUID, org_id: uuid.UUID | None, db: AsyncSession
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

    _filters = [Lease.id == lease_id]
    if org_id is not None:
        _filters.append(Lease.organisation_id == org_id)
    result = await db.execute(select(Lease).where(*_filters))
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

    # Prefer updating the tenant's most recent invite so they can use the same
    # URL they already have rather than waiting for a new link by email.
    # Only fall back to creating a new invite if the existing one was cancelled.
    now = datetime.now(timezone.utc)

    latest_result = await db.execute(
        select(TenantInvite)
        .where(TenantInvite.tenant_id == tenant.id)
        .order_by(TenantInvite.sent_at.desc())
        .limit(1)
    )
    latest = latest_result.scalar_one_or_none()

    if latest:
        # Reuse existing invite — patch in the lease and extend the expiry
        latest.lease_id = lease.id
        latest.property_id = lease.property_id
        latest.unit_id = lease.unit_id
        latest.status = InviteStatus.pending
        latest.expires_at = now + timedelta(hours=INVITE_EXPIRY_HOURS)
        new_invite = latest
    else:
        # No usable invite — create a fresh one
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

    tenant.onboarding_token = new_invite.token
    # token is only defined in the else branch; always resolve it from the invite
    token = new_invite.token

    await db.flush()
    await db.refresh(new_invite)

    log.info(
        "onboarding_link.sent",
        lease_id=str(lease_id),
        tenant_id=str(tenant.id),
        token=token[:8] + "…",
    )

    # Notify the tenant that their lease agreement is ready (non-fatal)
    await _send_tenant_invite_email(
        email=tenant.email,
        first_name=tenant.first_name,
        token=token,
        org_id=org_id,
        db=db,
    )

    return _invite_out(new_invite)


# ── Email helpers ─────────────────────────────────────────────────────────────

async def _send_tenant_invite_email(
    *,
    email: str,
    first_name: str,
    token: str,
    org_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    """
    Send the tenant their onboarding invite link by email.
    Looks up the org name for a personalised greeting.
    Non-fatal — logs a warning on failure without raising.
    """
    from app.core.config import get_settings
    from app.services.settings_service import get_email_provider_from_db
    from app.models.organisation import Organisation

    try:
        s = get_settings()
        org = await db.get(Organisation, org_id)
        org_name = org.name if org else "your property manager"

        onboarding_url = f"{s.frontend_url}/onboarding/{token}"

        subject = f"You've been invited to Crib by {org_name}"
        body = (
            f"Hi {first_name},\n\n"
            f"{org_name} has invited you to set up your tenant account on Crib.\n\n"
            "Complete your profile and upload your documents using the link below "
            "— it only takes a few minutes:\n\n"
            f"  {onboarding_url}\n\n"
            "This link is valid for 72 hours. If it expires, contact your property "
            "manager to request a new one.\n\n"
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
            log.info("tenant.invite_email_sent", email=email)
        else:
            log.warning("tenant.invite_email_failed", email=email, reason=result.failure_reason)
    except Exception:
        log.warning("tenant.invite_email_exception", email=email, exc_info=True)


async def _send_rejection_email(
    *,
    email: str,
    first_name: str,
    reason: str,
    onboarding_token: str,
) -> None:
    """
    Notify the tenant that their application was rejected and give them the
    link to resubmit. The invite expiry has already been extended by 7 days
    before this is called.
    """
    from app.core.config import get_settings
    from app.services.settings_service import get_email_provider_from_db

    try:
        s = get_settings()
        onboarding_url = f"{s.frontend_url}/onboarding/{onboarding_token}"

        subject = "Your rental application needs attention"
        body = (
            f"Hi {first_name},\n\n"
            "Your landlord has reviewed your rental application and has requested "
            "some changes before it can be approved.\n\n"
            f"Reason: {reason}\n\n"
            "Please use the link below to update your application. Your previous "
            "information is saved — you only need to make the requested changes and "
            "resubmit:\n\n"
            f"  {onboarding_url}\n\n"
            "This link is valid for 7 days. If you have any questions, contact "
            "your property manager directly.\n\n"
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
            log.info("tenant.rejection_email_sent", email=email)
        else:
            log.warning("tenant.rejection_email_failed", email=email, reason=result.failure_reason)
    except Exception:
        log.warning("tenant.rejection_email_exception", email=email, exc_info=True)


# ── Approve / Reject ──────────────────────────────────────────────────────────

async def _notify_resubmission(
    tenant: "Tenant",
    organisation_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    """
    Email the organisation's contact when a tenant resubmits after rejection.
    Looks up the org's contact_email (settings blob) and falls back to any
    active manager/owner profile email in the org.
    Non-fatal — logs a warning on failure without raising.
    """
    from app.core.config import get_settings
    from app.services.settings_service import get_email_provider_from_db
    from app.models.organisation import Organisation
    from app.models.profile import Profile

    try:
        s = get_settings()

        # 1. Try org contact email
        org = await db.get(Organisation, organisation_id)
        recipient_email: str | None = (org.settings or {}).get("contact_email") if org else None
        recipient_name: str = org.name if org else "Property Manager"

        # 2. Fallback: first active manager/owner profile in the org
        if not recipient_email:
            mgr_result = await db.execute(
                select(Profile).where(
                    Profile.organisation_id == organisation_id,
                    Profile.role.in_(["owner", "manager"]),
                    Profile.deleted_at.is_(None),
                    Profile.email.is_not(None),
                ).limit(1)
            )
            mgr = mgr_result.scalar_one_or_none()
            if mgr:
                recipient_email = mgr.email
                recipient_name = mgr.display_name or recipient_name

        if not recipient_email:
            log.warning(
                "tenant.resubmission_notify_skipped",
                tenant_id=str(tenant.id),
                reason="no_contact_email_found",
            )
            return

        tenant_name = f"{tenant.first_name} {tenant.last_name}".strip()
        dashboard_url = f"{s.frontend_url}/tenants/{tenant.id}"

        subject = f"Application resubmitted — {tenant_name}"
        body = (
            f"Hi {recipient_name},\n\n"
            f"{tenant_name} has updated and resubmitted their rental application "
            f"on Crib after your feedback.\n\n"
            f"Please log in to review their updated documents and either approve "
            f"or provide further feedback:\n\n"
            f"  {dashboard_url}\n\n"
            "— The Crib Team"
        )

        provider = await get_email_provider_from_db(db)
        result = await provider.send(
            recipient_name=recipient_name,
            recipient_email=recipient_email,
            recipient_phone=None,
            subject=subject,
            body=body,
        )
        if result.success:
            log.info(
                "tenant.resubmission_notify_sent",
                tenant_id=str(tenant.id),
                recipient=recipient_email,
            )
        else:
            log.warning(
                "tenant.resubmission_notify_failed",
                tenant_id=str(tenant.id),
                reason=result.failure_reason,
            )
    except Exception:
        log.warning(
            "tenant.resubmission_notify_exception",
            tenant_id=str(tenant.id),
            exc_info=True,
        )


async def approve_tenant(
    tenant_id: uuid.UUID, org_id: uuid.UUID | None, db: AsyncSession
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
    tenant_id: uuid.UUID, reason: str, org_id: uuid.UUID | None, db: AsyncSession
) -> TenantOut:
    tenant = await _get_tenant(tenant_id, org_id, db)
    tenant.onboarding_state = onboarding_sm.transition_or_422(
        tenant.onboarding_state, "TENANT_REJECTED"
    )
    tenant.rejection_reason = reason

    # Extend the most recent invite's expiry by 7 days so the tenant can
    # resubmit on their existing link without the landlord needing to resend.
    now = datetime.now(timezone.utc)
    invite_result = await db.execute(
        select(TenantInvite)
        .where(TenantInvite.tenant_id == tenant_id)
        .order_by(TenantInvite.sent_at.desc())
        .limit(1)
    )
    latest_invite = invite_result.scalar_one_or_none()
    if latest_invite:
        latest_invite.expires_at = now + timedelta(days=7)
        latest_invite.status = InviteStatus.pending  # reactivate so tenant can use link

    await db.flush()
    await db.refresh(tenant, attribute_names=["onboarding_state", "rejection_reason", "updated_at"])

    # Email the tenant so they know to resubmit on their original link (non-fatal)
    if latest_invite and tenant.email:
        await _send_rejection_email(
            email=tenant.email,
            first_name=tenant.first_name,
            reason=reason,
            onboarding_token=latest_invite.token,
        )

    return _tenant_out(tenant)


# ── Documents ─────────────────────────────────────────────────────────────────

async def list_documents(
    tenant_id: uuid.UUID, org_id: uuid.UUID | None, db: AsyncSession
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
    org_id: uuid.UUID | None, db: AsyncSession
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
    org_id: uuid.UUID | None, db: AsyncSession
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
    org_id: uuid.UUID | None, db: AsyncSession
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
    tenant_id: uuid.UUID,
    org_id: uuid.UUID | None,
    db: AsyncSession,
    *,
    requested_by_profile_id: uuid.UUID | None = None,
) -> None:
    """
    GDPR right to erasure (Art. 17) — replaces all PII with anonymised placeholders.

    The row is retained for audit and financial history; every identifying field
    is overwritten.  Also soft-deletes TenantDocument rows — the actual files must
    be purged from object storage separately (storage keys are preserved in the
    audit log).

    Works on already-soft-deleted tenants (include_deleted=True) so a two-step
    "delete then erase" flow is supported.
    """
    tenant = await _get_tenant(tenant_id, org_id, db, include_deleted=True)

    now = datetime.now(timezone.utc)
    anon_id = str(tenant.id)[:8]

    # ── Wipe all PII fields ────────────────────────────────────────────────────
    _pii_fields = [
        "first_name", "last_name", "email", "phone",
        "date_of_birth", "nationality", "nin",
        "whatsapp_number", "mobile_money_number", "mobile_money_provider",
        "emergency_contact", "notes", "onboarding_draft", "tags",
        "logto_user_id", "onboarding_token",
    ]
    tenant.first_name        = "Anonymised"
    tenant.last_name         = anon_id
    tenant.email             = f"anonymised-{anon_id}@deleted.invalid"
    tenant.phone             = None
    tenant.date_of_birth     = None
    tenant.nationality       = None
    tenant.nin               = None
    tenant.whatsapp_number   = None
    tenant.mobile_money_number  = None
    tenant.mobile_money_provider = None
    tenant.emergency_contact = None
    tenant.notes             = None
    tenant.onboarding_draft  = None
    tenant.tags              = []
    tenant.logto_user_id     = None
    tenant.onboarding_token  = None
    tenant.anonymised_at     = now
    tenant.deleted_at        = now  # also soft-delete so it's hidden from listings
    tenant.status            = TenantStatus.inactive

    # ── Soft-delete document rows (keep tombstone, PII metadata stripped) ──────
    # The caller is responsible for purging the actual files from object storage
    # using the stored keys before calling this function.
    doc_storage_keys = []
    for doc in tenant.documents:
        if doc.deleted_at is None:           # skip already-erased docs
            doc_storage_keys.append(doc.url) # preserve key for storage purge audit
            doc.name       = f"[erased-{anon_id}]"
            doc.url        = ""
            doc.deleted_at = now

    await db.flush()

    # ── GDPR audit log ─────────────────────────────────────────────────────────
    from app.models.gdpr import GdprRequest
    db.add(GdprRequest(
        subject_type="tenant",
        subject_id=tenant_id,
        request_type="anonymise",
        requested_by_profile_id=requested_by_profile_id,
        completed_at=now,
        fields_cleared=_pii_fields,
        notes=(
            f"GDPR erasure. {len(doc_storage_keys)} document(s) soft-deleted. "
            f"Storage keys to purge: {doc_storage_keys}"
        ) if doc_storage_keys else "GDPR erasure. No documents.",
    ))
    await db.flush()
