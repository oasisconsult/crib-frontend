"""
Onboarding payment flow service.

Orchestrates the trust-first, payment-before-signing onboarding pipeline:

  draft
  → onboarding_started    (tenant opens link)
  → agreement_previewed   (tenant views terms snapshot)
  → terms_accepted        (tenant explicitly accepts)
  → payment_pending       (payment records created)
  → payment_secured       (all payments confirmed)
  → agreement_signed      (tenant signs final agreement)
  → active                (lease activated, unit/tenant updated)

Manager fast-path (draft → active directly) lives in lease_service and is
unaffected by this service.

Key design rules:
  - All public functions are idempotent: repeated calls at the correct state
    return the current state without duplicating records.
  - Snapshot equality is strict: financial terms + dates only (no free text).
  - Payment auto-confirm is controlled by system settings.
  - Advance payment months is read from effective rules (unit → property → system).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import structlog
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.state_machine import lease_onboarding_sm
from app.models.lease import Lease, LeaseStatus
from app.models.payment import Payment, PaymentStatus
from app.models.property import Property, Unit, UnitStatus
from app.models.tenant import InviteStatus, OnboardingState, Tenant, TenantInvite, TenantStatus
from app.models.tenancy_agreement import TenancyAgreement, TenancyAgreementStatus
from app.schemas.lease import LeaseOut
from app.schemas.onboarding import (
    AgreementPreviewOut,
    OnboardingFlowStatus,
    OnboardingPaymentCreate,
    OnboardingPaymentOut,
    OnboardingSignBody,
    TermsAcceptBody,
    TermsAcceptOut,
)
from app.schemas.tenant import TenantInviteOut, TenantOut
from app.services import lease_service, payment_service
from app.services.tenant_service import _invite_out, _tenant_out

log = structlog.get_logger(__name__)

# Snapshot fields compared for equality — excludes free-text notes
_SNAPSHOT_COMPARE_FIELDS = {
    "leaseId", "startDate", "endDate", "monthlyRent", "currency",
    "depositAmount", "rentDayOfMonth", "noticePeriodDays", "gracePeriodDays",
    "lateFeeType", "lateFeeValue", "advancePaymentMonths", "snapshotVersion",
}


# ── Token resolution helpers ──────────────────────────────────────────────────

async def _resolve_invite(token: str, db: AsyncSession) -> TenantInvite:
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

    return invite


async def _resolve_tenant(invite: TenantInvite, db: AsyncSession) -> Tenant:
    result = await db.execute(
        select(Tenant)
        .options(selectinload(Tenant.documents))
        .where(Tenant.id == invite.tenant_id)
    )
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    return tenant


async def _resolve_lease(invite: TenantInvite, db: AsyncSession) -> Lease | None:
    """Return the lease linked to this invite, or None if no lease_id set."""
    if not invite.lease_id:
        return None
    result = await db.execute(
        select(Lease).where(Lease.id == invite.lease_id)
    )
    return result.scalar_one_or_none()


async def _get_unit_and_property(
    lease: Lease, db: AsyncSession
) -> tuple[Unit, Property]:
    unit_result = await db.execute(select(Unit).where(Unit.id == lease.unit_id))
    unit = unit_result.scalar_one_or_none()
    if not unit:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unit not found")
    prop_result = await db.execute(select(Property).where(Property.id == lease.property_id))
    prop = prop_result.scalar_one_or_none()
    if not prop:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Property not found")
    return unit, prop


# ── System settings helpers ───────────────────────────────────────────────────

async def _get_setting(key: str, default: str, db: AsyncSession) -> str:
    from app.models.system_setting import SystemSetting
    row = await db.get(SystemSetting, key)
    return row.value if row else default


async def _auto_confirm_enabled(db: AsyncSession, method: str) -> bool:
    enabled = await _get_setting("payments.auto_confirm_enabled", "false", db)
    if enabled.lower() != "true":
        return False
    methods_csv = await _get_setting(
        "payments.auto_confirm_methods", "mobile_money_mtn,mobile_money_airtel", db
    )
    allowed = {m.strip() for m in methods_csv.split(",")}
    return method in allowed


async def _advance_payment_months(
    unit: Unit, prop: Property, db: AsyncSession, lease: "Lease | None" = None
) -> int:
    """Effective advance months: lease override → unit rules → property rules → system setting."""
    if lease is not None and lease.advance_months is not None:
        return max(1, lease.advance_months)
    rules = unit.rules or prop.rules or {}
    if "advancePaymentMonths" in rules:
        return int(rules["advancePaymentMonths"])
    val = await _get_setting("payments.advance_payment_months", "1", db)
    return max(1, int(val))


# ── Snapshot builder ──────────────────────────────────────────────────────────

def _build_snapshot(
    lease: Lease,
    tenant: Tenant,
    unit: Unit,
    prop: Property,
    advance_months: int,
) -> dict:
    deposit = float(lease.deposit_amount) if lease.deposit_amount else 0.0
    total_advance = float(lease.monthly_rent) * advance_months
    return {
        "leaseId":              str(lease.id),
        "tenantName":           f"{tenant.first_name} {tenant.last_name}",
        "tenantEmail":          tenant.email,
        "propertyName":         prop.name,
        "unitName":             unit.name,
        "startDate":            str(lease.start_date),
        "endDate":              str(lease.end_date) if lease.end_date else None,
        "monthlyRent":          float(lease.monthly_rent),
        "currency":             lease.currency,
        "depositAmount":        deposit,
        "rentDayOfMonth":       lease.rent_day_of_month,
        "noticePeriodDays":     lease.notice_period_days,
        "gracePeriodDays":      lease.grace_period_days,
        "lateFeeType":          lease.late_fee_type,
        "lateFeeValue":         float(lease.late_fee_value),
        "advancePaymentMonths": advance_months,
        "totalDeposit":         deposit,
        "totalAdvanceRent":     total_advance,
        "totalDueAtOnboarding": deposit + total_advance,
        "snapshotVersion":      "1",
    }


def _snapshot_to_preview(snapshot: dict, generated_at: str) -> AgreementPreviewOut:
    return AgreementPreviewOut(
        lease_id=snapshot["leaseId"],
        tenant_name=snapshot["tenantName"],
        tenant_email=snapshot["tenantEmail"],
        property_name=snapshot["propertyName"],
        unit_name=snapshot["unitName"],
        start_date=snapshot["startDate"],
        end_date=snapshot.get("endDate"),
        monthly_rent=snapshot["monthlyRent"],
        currency=snapshot["currency"],
        deposit_amount=snapshot["depositAmount"],
        rent_day_of_month=snapshot["rentDayOfMonth"],
        notice_period_days=snapshot["noticePeriodDays"],
        grace_period_days=snapshot["gracePeriodDays"],
        late_fee_type=snapshot["lateFeeType"],
        late_fee_value=snapshot["lateFeeValue"],
        advance_payment_months=snapshot["advancePaymentMonths"],
        total_deposit=snapshot["totalDeposit"],
        total_advance_rent=snapshot["totalAdvanceRent"],
        total_due_at_onboarding=snapshot["totalDueAtOnboarding"],
        generated_at=generated_at,
        snapshot_version=snapshot.get("snapshotVersion", "1"),
    )


def _snapshots_equal(a: dict, b: dict) -> bool:
    """Compare only the legally-binding fields; ignore display-only fields."""
    return all(a.get(k) == b.get(k) for k in _SNAPSHOT_COMPARE_FIELDS)


# ── Step helpers (current step resolver) ─────────────────────────────────────

_LEASE_STATUS_TO_STEP: dict[str, str] = {
    LeaseStatus.draft:               "agreement_preview",
    LeaseStatus.onboarding_started:  "agreement_preview",
    LeaseStatus.agreement_previewed: "terms_acceptance",
    LeaseStatus.terms_accepted:      "payment",
    LeaseStatus.payment_pending:     "payment_pending",
    LeaseStatus.payment_secured:     "payment_success",
    LeaseStatus.agreement_signed:    "done",
    LeaseStatus.active:              "done",
}


def _current_step(
    tenant: Tenant,
    lease: Lease | None,
) -> tuple[str, str]:
    """Returns (onboarding_phase, current_step)."""
    if tenant.onboarding_state not in (OnboardingState.approved, OnboardingState.activated):
        phase = "profile"
        draft_step = (tenant.onboarding_draft or {}).get("step", "profile")
        return phase, draft_step
    if lease is None:
        return "profile", "profile"
    if tenant.onboarding_state == OnboardingState.activated or lease.status == LeaseStatus.active:
        return "complete", "done"
    step = _LEASE_STATUS_TO_STEP.get(
        lease.status.value if hasattr(lease.status, "value") else lease.status,
        "agreement_preview",
    )
    return "payment_flow", step


# ── LeaseOut helper (avoid circular import with lease_service._lease_out) ────

def _lease_out_dict(lease: Lease) -> dict:
    """Thin dict serialisation used inside OnboardingFlowStatus.lease."""
    from app.services.lease_service import _lease_out
    return _lease_out(lease).model_dump(by_alias=True)


# ── Public API ────────────────────────────────────────────────────────────────

async def get_onboarding_flow_status(
    token: str, db: AsyncSession
) -> OnboardingFlowStatus:
    """
    Returns full state for the wizard to render the correct step.
    Also auto-transitions invited → started.
    """
    from app.core.state_machine import onboarding_sm

    invite = await _resolve_invite(token, db)
    tenant = await _resolve_tenant(invite, db)
    lease = await _resolve_lease(invite, db)

    # Auto-start if still invited
    if tenant.onboarding_state == OnboardingState.invited:
        tenant.onboarding_state = onboarding_sm.transition(
            tenant.onboarding_state, "ONBOARDING_STARTED"
        )
        await db.flush()
        await db.refresh(tenant, attribute_names=["onboarding_state", "updated_at"])

    phase, step = _current_step(tenant, lease)

    preview: AgreementPreviewOut | None = None
    if lease and lease.agreement_preview_snapshot:
        preview = _snapshot_to_preview(
            lease.agreement_preview_snapshot,
            lease.agreement_preview_snapshot.get("generatedAt", ""),
        )

    return OnboardingFlowStatus(
        tenant=_tenant_out(tenant).model_dump(by_alias=True),
        invite=_invite_out(invite).model_dump(by_alias=True),
        lease=_lease_out_dict(lease) if lease else None,
        agreement_preview=preview,
        onboarding_phase=phase,
        current_step=step,
        terms_accepted_at=(
            lease.terms_accepted_at.isoformat() if lease and lease.terms_accepted_at else None
        ),
        payment_secured=bool(
            lease and lease.status in (
                LeaseStatus.payment_secured, LeaseStatus.agreement_signed, LeaseStatus.active
            )
        ),
        agreement_signed=bool(
            lease and lease.status in (LeaseStatus.agreement_signed, LeaseStatus.active)
        ),
        is_active=bool(lease and lease.status == LeaseStatus.active),
    )


async def preview_agreement(token: str, db: AsyncSession) -> AgreementPreviewOut:
    """
    Generate and store the agreement snapshot.
    Advances: draft/onboarding_started → agreement_previewed (idempotent if already there).
    """
    invite = await _resolve_invite(token, db)
    tenant = await _resolve_tenant(invite, db)
    lease = await _resolve_lease(invite, db)

    if not lease:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No lease is linked to this invite. Ask your landlord to link a lease.",
        )

    if tenant.onboarding_state not in (OnboardingState.approved, OnboardingState.activated):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Tenant must be approved before viewing the agreement.",
        )

    unit, prop = await _get_unit_and_property(lease, db)
    advance_months = await _advance_payment_months(unit, prop, db, lease=lease)

    # Idempotent / read-only for all post-preview statuses — return stored snapshot with fresh HTML
    _post_preview_statuses = {
        LeaseStatus.agreement_previewed,
        LeaseStatus.terms_accepted,
        LeaseStatus.payment_pending,
        LeaseStatus.payment_secured,
        LeaseStatus.agreement_signed,
        LeaseStatus.active,
    }
    if lease.status in _post_preview_statuses and lease.agreement_preview_snapshot:
        rendered_html = await _render_agreement_html(lease, tenant, unit, prop, db)
        out = _snapshot_to_preview(
            lease.agreement_preview_snapshot,
            lease.agreement_preview_snapshot.get("generatedAt", ""),
        )
        out.rendered_html = rendered_html
        return out

    allowed_entry = {LeaseStatus.draft, LeaseStatus.onboarding_started}
    if lease.status not in allowed_entry:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot preview agreement from status '{lease.status}'. "
                   f"Current step: {_LEASE_STATUS_TO_STEP.get(lease.status, 'unknown')}",
        )

    now = datetime.now(timezone.utc)

    snapshot = _build_snapshot(lease, tenant, unit, prop, advance_months)
    snapshot["generatedAt"] = now.isoformat()

    # First call: advance draft → onboarding_started → agreement_previewed
    if lease.status == LeaseStatus.draft:
        lease.status = LeaseStatus.onboarding_started
    lease.status = LeaseStatus.agreement_previewed
    lease.agreement_preview_snapshot = snapshot

    await db.flush()
    await db.refresh(lease, attribute_names=["status", "agreement_preview_snapshot", "updated_at"])

    rendered_html = await _render_agreement_html(lease, tenant, unit, prop, db)
    out = _snapshot_to_preview(snapshot, now.isoformat())
    out.rendered_html = rendered_html
    return out


async def accept_terms(
    token: str, body: TermsAcceptBody, db: AsyncSession
) -> TermsAcceptOut:
    """
    Record explicit terms acceptance.
    Gate: accepted must be True; lease must be in agreement_previewed.
    Idempotent: repeated calls return current state.
    """
    if not body.accepted:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="You must accept the terms to continue.",
        )

    invite = await _resolve_invite(token, db)
    lease = await _resolve_lease(invite, db)

    if not lease:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No lease linked.")

    # Idempotent — terms are already accepted for any status beyond agreement_previewed
    _already_accepted = {
        LeaseStatus.terms_accepted,
        LeaseStatus.payment_pending,
        LeaseStatus.payment_secured,
        LeaseStatus.agreement_signed,
        LeaseStatus.active,
    }
    if lease.status in _already_accepted:
        accepted_at = lease.terms_accepted_at or datetime.now(timezone.utc)
        return TermsAcceptOut(
            lease_id=str(lease.id),
            status=lease.status.value,
            terms_accepted_at=accepted_at.isoformat(),
        )

    if lease.status != LeaseStatus.agreement_previewed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot accept terms from status '{lease.status}'. "
                   f"View the agreement preview first.",
        )

    now = datetime.now(timezone.utc)
    lease.status = LeaseStatus.terms_accepted
    lease.terms_accepted_at = now

    await db.flush()
    await db.refresh(lease, attribute_names=["status", "terms_accepted_at", "updated_at"])

    return TermsAcceptOut(
        lease_id=str(lease.id),
        status=lease.status.value,
        terms_accepted_at=now.isoformat(),
    )


async def _notify_landlord_payment_submitted(
    lease: "Lease",
    tenant: "Tenant",
    payments: list,
    db: AsyncSession,
) -> None:
    """Email the landlord/agency when the tenant submits onboarding payments."""
    from app.core.config import get_settings
    from app.integrations.notifications.email import get_email_provider
    from app.models.organisation import Organisation
    from app.models.profile import Profile

    try:
        s = get_settings()
        org = await db.get(Organisation, lease.organisation_id)

        # Resolve recipient — prefer org contact_email, fall back to owner profile
        recipient_email: str | None = (org.settings or {}).get("contact_email") if org else None
        recipient_name = org.name if org else "Property Manager"
        if not recipient_email:
            mgr = (await db.execute(
                select(Profile).where(
                    Profile.organisation_id == lease.organisation_id,
                    Profile.role.in_(["owner", "manager"]),
                    Profile.deleted_at.is_(None),
                    Profile.email.is_not(None),
                ).limit(1)
            )).scalar_one_or_none()
            if mgr:
                recipient_email = mgr.email
                recipient_name = mgr.display_name or recipient_name

        if not recipient_email:
            return

        tenant_name = f"{tenant.first_name} {tenant.last_name}".strip()
        total = sum(float(p.get("amount", 0)) for p in payments)
        currency = payments[0].get("currency", "UGX") if payments else "UGX"
        dashboard_url = f"{s.frontend_url}/leases/{lease.id}"

        subject = f"Payment received — {tenant_name}"
        body = (
            f"Hi {recipient_name},\n\n"
            f"{tenant_name} has submitted their onboarding payment"
            f" of {currency} {total:,.0f}.\n\n"
            "Please log in to confirm the payment so their tenancy agreement "
            "can be finalised:\n\n"
            f"  {dashboard_url}\n\n"
            "— The Crib Team"
        )

        result = await get_email_provider().send(
            recipient_name=recipient_name,
            recipient_email=recipient_email,
            recipient_phone=None,
            subject=subject,
            body=body,
        )
        if result.success:
            log.info("onboarding.landlord_payment_notify_sent", lease_id=str(lease.id))
        else:
            log.warning("onboarding.landlord_payment_notify_failed", reason=result.failure_reason)
    except Exception:
        log.warning("onboarding.landlord_payment_notify_exception", exc_info=True)


async def _send_payment_receipt(
    lease: "Lease",
    tenant: "Tenant",
    payments: list,
    db: AsyncSession,
) -> None:
    """Email the tenant a payment receipt after the landlord confirms payment."""
    from app.core.config import get_settings
    from app.integrations.notifications.email import get_email_provider
    from app.models.property import Property, Unit

    try:
        s = get_settings()
        if not tenant.email:
            return

        # Resolve property/unit names
        unit = await db.get(Unit, lease.unit_id) if lease.unit_id else None
        prop = await db.get(Property, lease.property_id) if lease.property_id else None
        property_label = f"{prop.name} — {unit.name}" if prop and unit else (prop.name if prop else "your property")

        tenant_name = f"{tenant.first_name} {tenant.last_name}".strip()
        total = sum(float(p.get("amount", 0)) for p in payments)
        currency = payments[0].get("currency", "UGX") if payments else "UGX"
        from datetime import date
        receipt_date = date.today().strftime("%-d %B %Y") if hasattr(date.today(), "strftime") else str(date.today())

        # Build itemised lines
        lines = []
        for p in payments:
            amt = float(p.get("amount", 0))
            cat = str(p.get("category", "payment")).replace("_", " ").title()
            lines.append(f"  {cat:<25} {currency} {amt:>12,.0f}")
        items = "\n".join(lines)

        subject = f"Payment receipt — {property_label}"
        body = (
            f"Hi {tenant_name},\n\n"
            "Your payment has been confirmed. Here is your receipt:\n\n"
            f"  Property:  {property_label}\n"
            f"  Date:      {receipt_date}\n"
            f"  Lease ref: {str(lease.id)[:8].upper()}\n\n"
            f"{items}\n"
            f"  {'─' * 40}\n"
            f"  {'Total':<25} {currency} {total:>12,.0f}\n\n"
            "Please keep this email as proof of payment.\n\n"
            "— The Crib Team"
        )

        result = await get_email_provider().send(
            recipient_name=tenant_name,
            recipient_email=tenant.email,
            recipient_phone=None,
            subject=subject,
            body=body,
        )
        if result.success:
            log.info("onboarding.payment_receipt_sent", tenant_id=str(tenant.id))
        else:
            log.warning("onboarding.payment_receipt_failed", reason=result.failure_reason)
    except Exception:
        log.warning("onboarding.payment_receipt_exception", exc_info=True)


async def submit_onboarding_payments(
    token: str, body: OnboardingPaymentCreate, db: AsyncSession
) -> OnboardingPaymentOut:
    """
    Create onboarding payment records (deposit + advance rent).

    Gate: lease.status == terms_accepted.
    Idempotency: each payment item carries a client idempotency_key.
    Repeated calls with the same keys return existing payments.

    Auto-confirm: if system settings enable auto-confirm for the chosen method,
    immediately confirm the payment and advance to payment_secured.
    """
    invite = await _resolve_invite(token, db)
    tenant = await _resolve_tenant(invite, db)
    lease = await _resolve_lease(invite, db)

    if not lease:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No lease linked.")

    # Allow re-entry if payment_pending (idempotency)
    if lease.status not in (LeaseStatus.terms_accepted, LeaseStatus.payment_pending):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot submit payments from status '{lease.status}'. "
                   f"Accept terms first.",
        )

    payment_outs = []
    new_payment_ids: list[str] = []

    for item in body.payments:
        # Idempotency: check if a Payment with this key already exists for this lease
        existing = await db.scalar(
            select(Payment).where(
                Payment.lease_id == lease.id,
                Payment.idempotency_key == item.idempotency_key,
            )
        )
        if existing and existing.status not in (PaymentStatus.failed, PaymentStatus.permanently_failed):
            payment_outs.append(_payment_dict(existing))
            new_payment_ids.append(str(existing.id))
            continue

        from app.schemas.payment import PaymentCreate
        p_body = PaymentCreate(
            amount=item.amount,
            currency=item.currency,
            category=item.category,
            method=item.method,
            reference=item.reference,
            idempotency_key=item.idempotency_key,
            paid_at=None,
            notes=f"Onboarding payment — {item.category}",
        )
        p_out = await payment_service.create_payment(
            body=p_body,
            lease_id=lease.id,
            org_id=lease.organisation_id,
            db=db,
        )
        payment_outs.append(p_out.model_dump(by_alias=True))
        new_payment_ids.append(p_out.id)

        # Auto-confirm if enabled for this method
        if await _auto_confirm_enabled(db, item.method):
            p_id = uuid.UUID(p_out.id)
            confirmed_out = await payment_service.confirm_payment(
                payment_id=p_id,
                lease_id=lease.id,
                org_id=lease.organisation_id,
                db=db,
            )
            payment_outs[-1] = confirmed_out.model_dump(by_alias=True)

    # Merge new IDs into lease.onboarding_payment_ids (idempotent: no dupes)
    existing_ids = set(lease.onboarding_payment_ids or [])
    lease.onboarding_payment_ids = list(existing_ids | set(new_payment_ids))

    # Advance to payment_pending (idempotent if already there)
    if lease.status == LeaseStatus.terms_accepted:
        lease.status = LeaseStatus.payment_pending

    # Check if all payments are now confirmed → advance to payment_secured
    await _maybe_secure_payment(lease, db)

    await db.flush()
    await db.refresh(lease, attribute_names=["status", "onboarding_payment_ids", "updated_at"])

    # Notify the landlord that payments have been submitted (non-fatal)
    await _notify_landlord_payment_submitted(lease, tenant, payment_outs, db)

    return OnboardingPaymentOut(
        lease_id=str(lease.id),
        lease_status=lease.status.value,
        payments=payment_outs,
    )


async def _maybe_secure_payment(lease: Lease, db: AsyncSession) -> None:
    """If all onboarding payments are confirmed, advance lease → payment_secured."""
    if lease.status not in (LeaseStatus.payment_pending, LeaseStatus.payment_secured):
        return
    if not lease.onboarding_payment_ids:
        return
    ids = [uuid.UUID(pid) for pid in lease.onboarding_payment_ids]
    payments = (await db.execute(
        select(Payment).where(Payment.id.in_(ids))
    )).scalars().all()

    # Accept both legacy `confirmed` and v4 `completed` as terminal success
    _terminal_success = {PaymentStatus.confirmed, PaymentStatus.completed}
    all_confirmed = bool(payments) and all(
        (p.status if isinstance(p.status, PaymentStatus) else PaymentStatus(p.status)) in _terminal_success
        for p in payments
    )
    if all_confirmed and lease.status != LeaseStatus.payment_secured:
        lease.status = LeaseStatus.payment_secured
        log.info("onboarding.payment_secured", lease_id=str(lease.id))


async def confirm_onboarding_payment(
    token: str, payment_id: str, db: AsyncSession
) -> OnboardingPaymentOut:
    """
    Manager (or webhook) confirms a single onboarding payment.
    If all onboarding payments become confirmed, advances lease → payment_secured.
    Idempotent: confirming an already-confirmed payment is a no-op.
    """
    invite = await _resolve_invite(token, db)
    lease = await _resolve_lease(invite, db)

    if not lease:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No lease linked.")

    if lease.status not in (LeaseStatus.payment_pending, LeaseStatus.payment_secured):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot confirm payment from lease status '{lease.status}'.",
        )

    p_uuid = uuid.UUID(payment_id)

    # Only confirm if in a confirmable state
    p = await db.scalar(select(Payment).where(Payment.id == p_uuid, Payment.lease_id == lease.id))
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found.")

    from app.services.payment_state_machine import can_be_confirmed
    p_status = p.status if isinstance(p.status, PaymentStatus) else PaymentStatus(p.status)
    if can_be_confirmed(p_status):
        await payment_service.confirm_payment(
            payment_id=p_uuid,
            lease_id=lease.id,
            org_id=lease.organisation_id,
            db=db,
        )

    await _maybe_secure_payment(lease, db)
    await db.flush()
    await db.refresh(lease, attribute_names=["status", "updated_at"])

    # Build payment list for response
    ids = [uuid.UUID(pid) for pid in (lease.onboarding_payment_ids or [])]
    payments = (await db.execute(
        select(Payment).where(Payment.id.in_(ids))
    )).scalars().all()

    payment_dicts = [_payment_dict(p) for p in payments]

    # Send receipt to tenant after payment is confirmed (non-fatal)
    tenant = await _resolve_tenant(invite, db)
    await _send_payment_receipt(lease, tenant, payment_dicts, db)

    return OnboardingPaymentOut(
        lease_id=str(lease.id),
        lease_status=lease.status.value,
        payments=payment_dicts,
    )


async def confirm_all_onboarding_payments(
    lease_id: uuid.UUID, org_id: uuid.UUID, db: AsyncSession
) -> OnboardingPaymentOut:
    """
    Manager action: confirm all pending onboarding payments for a lease and
    advance it to payment_secured when all payments are confirmed.
    Idempotent — safe to call multiple times.
    """
    from app.models.lease import Lease as LeaseModel

    result = await db.execute(
        select(LeaseModel).where(
            LeaseModel.id == lease_id, LeaseModel.organisation_id == org_id
        )
    )
    lease = result.scalar_one_or_none()
    if not lease:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lease not found.")

    if lease.status not in (LeaseStatus.payment_pending, LeaseStatus.payment_secured):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot confirm payments from lease status '{lease.status.value}'.",
        )

    payment_ids = lease.onboarding_payment_ids or []
    if not payment_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No onboarding payments found for this lease.",
        )

    ids = [uuid.UUID(pid) for pid in payment_ids]
    payments_list = (await db.execute(
        select(Payment).where(Payment.id.in_(ids))
    )).scalars().all()

    from app.services.payment_state_machine import can_be_confirmed as _can_confirm
    for p in payments_list:
        p_status = p.status if isinstance(p.status, PaymentStatus) else PaymentStatus(p.status)
        if _can_confirm(p_status):
            await payment_service.confirm_payment(
                payment_id=p.id,
                lease_id=lease.id,
                org_id=lease.organisation_id,
                db=db,
            )

    await _maybe_secure_payment(lease, db)
    await db.flush()
    await db.refresh(lease, attribute_names=["status", "updated_at"])

    refreshed_payments = (await db.execute(
        select(Payment).where(Payment.id.in_(ids))
    )).scalars().all()

    log.info(
        "onboarding.payments_confirmed_by_manager",
        lease_id=str(lease.id),
        count=len(payment_ids),
    )

    return OnboardingPaymentOut(
        lease_id=str(lease.id),
        lease_status=lease.status.value,
        payments=[_payment_dict(p) for p in refreshed_payments],
    )


async def sign_agreement(
    token: str, body: OnboardingSignBody, db: AsyncSession
) -> dict:
    """
    Tenant signs the final agreement.

    Gate: lease.status == payment_secured.
    Strict check: final snapshot must equal preview snapshot (no term changes allowed).
    Auto-activates the lease immediately after signing.
    Idempotent: already signed → return current state.
    """
    invite = await _resolve_invite(token, db)
    tenant = await _resolve_tenant(invite, db)
    lease = await _resolve_lease(invite, db)

    if not lease:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No lease linked.")

    # Idempotent
    if lease.status in (LeaseStatus.agreement_signed, LeaseStatus.active):
        return _lease_out_dict(lease)

    if lease.status != LeaseStatus.payment_secured:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot sign from status '{lease.status}'. Payment must be secured first.",
        )

    if not lease.agreement_preview_snapshot:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No agreement preview snapshot found. Preview the agreement first.",
        )

    unit, prop = await _get_unit_and_property(lease, db)
    advance_months = (lease.agreement_preview_snapshot or {}).get("advancePaymentMonths", 1)
    final_snapshot = _build_snapshot(lease, tenant, unit, prop, advance_months)

    # Strict equality check — block signing if terms changed since preview
    if not _snapshots_equal(lease.agreement_preview_snapshot, final_snapshot):
        log.error(
            "onboarding.snapshot_mismatch",
            lease_id=str(lease.id),
            preview=lease.agreement_preview_snapshot,
            final=final_snapshot,
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Agreement terms have changed since the preview was shown. "
                   "The agreement preview must be regenerated before signing.",
        )

    now = datetime.now(timezone.utc)
    final_snapshot["signedAt"] = now.isoformat()
    lease.final_agreement_snapshot = final_snapshot
    lease.signed_at = now
    lease.status = LeaseStatus.agreement_signed

    # Check for landlord pre-signature (manager signed before sending to tenant)
    existing_ta_result = await db.execute(
        select(TenancyAgreement).where(TenancyAgreement.lease_id == lease.id)
    )
    existing_ta = existing_ta_result.scalar_one_or_none()

    landlord_sig_url = existing_ta.landlord_signature_data_url if existing_ta else None
    landlord_signed_at_str = (
        f"{existing_ta.landlord_signed_at.day} {existing_ta.landlord_signed_at.strftime('%B %Y %H:%M')} UTC"
        if existing_ta and existing_ta.landlord_signed_at else None
    )
    landlord_signer_name = existing_ta.landlord_signer_name if existing_ta else None

    # Determine final agreement status: fully_executed if landlord already pre-signed
    final_status = (
        TenancyAgreementStatus.fully_executed
        if landlord_sig_url
        else TenancyAgreementStatus.tenant_signed
    )

    # Create TenancyAgreement record (or update existing pre-sign record)
    rendered_html = await _render_agreement_html(
        lease=lease,
        tenant=tenant,
        unit=unit,
        prop=prop,
        db=db,
        tenant_signature_data_url=body.signature_data_url,
        tenant_signed_at=f"{now.day} {now.strftime('%B %Y %H:%M')} UTC",
        landlord_signature_data_url=landlord_sig_url,
        landlord_signed_at=landlord_signed_at_str,
        landlord_signer_name=landlord_signer_name,
    )
    if existing_ta:
        existing_ta.rendered_html = rendered_html
        existing_ta.status = final_status
        existing_ta.tenant_signature_data_url = body.signature_data_url
        existing_ta.tenant_signed_at = now
    else:
        ta = TenancyAgreement(
            lease_id=lease.id,
            rendered_html=rendered_html,
            status=final_status,
            tenant_signature_data_url=body.signature_data_url,
            tenant_signed_at=now,
        )
        db.add(ta)
    await db.flush()

    # Auto-activate immediately after signing
    await _activate_via_onboarding(lease, tenant, unit, db)

    await db.refresh(lease, attribute_names=["status", "signed_at", "onboarding_completed_at", "updated_at"])
    return _lease_out_dict(lease)


async def _activate_via_onboarding(
    lease: Lease, tenant: Tenant, unit: Unit, db: AsyncSession
) -> None:
    """
    Apply all activate_lease side-effects after signing.
    Mirrors lease_service.activate_lease but skips the duplicate-active-lease check
    since payment_secured already implies intent to occupy.

    Also creates the tenant's Logto account (best-effort — failure does not block activation).
    """
    now = datetime.now(timezone.utc)

    lease.status = LeaseStatus.active
    lease.onboarding_completed_at = now

    unit.status = UnitStatus.occupied
    unit.current_tenant_id = tenant.id
    unit.current_lease_id = lease.id

    tenant.status = TenantStatus.active
    tenant.onboarding_state = OnboardingState.activated
    tenant.current_lease_id = lease.id
    tenant.current_unit_id = unit.id
    tenant.current_property_id = unit.property_id

    from app.services.payment_service import create_deposit_record, generate_rent_schedules
    await generate_rent_schedules(lease, db)
    await create_deposit_record(lease, db)

    await db.flush()

    # ── Logto account + Profile (best-effort — won't block activation if it fails) ──
    from app.models.organisation import Organisation
    from app.models.property import Property

    # Resolution chain: lease.organisation_id → property.organisation_id (fallback)
    org = await db.get(Organisation, lease.organisation_id)
    if org is None and unit.property_id:
        prop = await db.get(Property, unit.property_id)
        if prop:
            org = await db.get(Organisation, prop.organisation_id)
            if org:
                log.warning(
                    "onboarding.org_resolved_via_property",
                    lease_org_id=str(lease.organisation_id),
                    property_id=str(unit.property_id),
                    resolved_org_id=str(prop.organisation_id),
                )
    if org:
        logto_user_id: str | None = tenant.logto_user_id

        # 1. Create Logto user if not already provisioned
        if not logto_user_id:
            from app.services.logto_service import create_tenant_user
            logto_user_id = await create_tenant_user(
                email=tenant.email,
                first_name=tenant.first_name,
                last_name=tenant.last_name,
                logto_org_id=org.logto_org_id,
            )
            if logto_user_id:
                tenant.logto_user_id = logto_user_id
                await db.flush()

        # 2. Upsert a Profile row so the tenant can call /me on first login
        if logto_user_id:
            try:
                from sqlalchemy import select as _select
                from app.models.profile import Profile

                existing = await db.scalar(
                    _select(Profile).where(Profile.logto_sub == logto_user_id)
                )
                if existing is None:
                    profile = Profile(
                        logto_sub=logto_user_id,
                        logto_org_id=org.logto_org_id,
                        organisation_id=org.id,  # use resolved org (may differ from lease.organisation_id)
                        role="tenant",
                        display_name=f"{tenant.first_name} {tenant.last_name}".strip(),
                        email=tenant.email,
                        phone=tenant.phone,
                        tenant_id=tenant.id,
                        gdpr_consent_given=False,
                    )
                    db.add(profile)
                else:
                    # Backfill fields if the profile was pre-created without them
                    if existing.tenant_id is None:
                        existing.tenant_id = tenant.id
                    if existing.organisation_id is None:
                        existing.organisation_id = org.id
                    if existing.logto_org_id is None:
                        existing.logto_org_id = org.logto_org_id
                await db.flush()
                log.info(
                    "onboarding.profile_upserted",
                    logto_sub=logto_user_id,
                    tenant_id=str(tenant.id),
                )
            except Exception as exc:  # noqa: BLE001
                log.warning("onboarding.profile_upsert_failed", error=str(exc))

    log.info("onboarding.lease_activated", lease_id=str(lease.id), tenant_id=str(tenant.id))


# ── Agreement rendering ───────────────────────────────────────────────────────

async def _render_agreement_html(
    lease: Lease,
    tenant: Tenant,
    unit: "Unit",
    prop: "Property",
    db: AsyncSession,
    tenant_signature_data_url: str | None = None,
    tenant_signed_at: str | None = None,
    landlord_signature_data_url: str | None = None,
    landlord_signed_at: str | None = None,
    landlord_signer_name: str | None = None,
) -> str:
    """Render the full tenancy agreement HTML."""
    from app.core.agreement_template import render_agreement
    from app.models.organisation import Organisation

    # Resolve landlord name.
    # Priority: owner profile display_name (for individual/personal orgs)
    #           → org.name (for agencies)
    #           → system agency.name setting (platform fallback)
    #           → "Landlord"
    from app.models.profile import Profile
    org = await db.get(Organisation, lease.organisation_id)
    agency_name = await _get_setting("agency.name", "", db)

    landlord_name: str = "Landlord"
    if org:
        # Look for a single owner profile — indicates a personal/individual landlord
        owner_result = await db.execute(
            select(Profile).where(
                Profile.organisation_id == org.id,
                Profile.role == "owner",
                Profile.deleted_at.is_(None),
            ).limit(2)
        )
        owners = owner_result.scalars().all()
        if len(owners) == 1 and owners[0].display_name:
            # Single owner with a name → individual landlord, use their name
            landlord_name = owners[0].display_name
        else:
            # Agency or no owner profile → use org name
            landlord_name = org.name or agency_name.strip() or "Landlord"
    elif agency_name.strip():
        landlord_name = agency_name.strip()

    # Resolve contact phones from system settings
    agency_phone = await _get_setting("agency.contact_phone", "", db)

    # Tenant contact: prefer WhatsApp, fall back to phone
    tenant_contact_phone = (
        tenant.whatsapp_number or tenant.phone or ""
    )

    # Build property address string from JSONB
    addr = prop.address or {}
    address_parts = [
        addr.get("line1", ""),
        addr.get("line2", ""),
        addr.get("city", ""),
        addr.get("state", ""),
        addr.get("postcode", ""),
        addr.get("country", ""),
    ]
    property_address = ", ".join(p for p in address_parts if p)

    # Format dates — cross-platform (avoid %-d which is Linux-only)
    def _fmt_date(d) -> str:
        if d is None:
            return ""
        if hasattr(d, "strftime"):
            return f"{d.day} {d.strftime('%B %Y')}"
        return str(d)

    # Resolve minimum lease months and max occupants from effective rules
    effective_rules: dict = {}
    if unit and unit.rules:
        effective_rules = unit.rules
    elif prop and prop.rules:
        effective_rules = prop.rules
    minimum_lease_months = int(effective_rules.get("minimum_lease_months", 6))
    max_occupants = int(effective_rules.get("max_occupants", 2))

    # Rolling date = start_date + minimum_lease_months
    from dateutil.relativedelta import relativedelta as _relativedelta
    if lease.start_date:
        rolling_dt = lease.start_date + _relativedelta(months=minimum_lease_months)
        rolling_date_str = _fmt_date(rolling_dt)
    else:
        rolling_date_str = _fmt_date(lease.start_date)

    now = datetime.now(timezone.utc)

    return render_agreement(
        landlord_name=landlord_name,
        tenant_name=f"{tenant.first_name} {tenant.last_name}",
        tenant_nin=tenant.nin or "N/A",
        tenant_contact_phone=tenant_contact_phone,
        landlord_contact_phone=agency_phone,
        property_address=property_address or prop.name,
        unit_name=unit.name,
        start_date=_fmt_date(lease.start_date),
        end_date=_fmt_date(lease.end_date) if lease.end_date else None,
        monthly_rent=float(lease.monthly_rent),
        currency=lease.currency,
        deposit_amount=float(lease.deposit_amount) if lease.deposit_amount else 0.0,
        rent_day_of_month=lease.rent_day_of_month,
        notice_period_days=lease.notice_period_days,
        grace_period_days=lease.grace_period_days,
        late_fee_type=lease.late_fee_type,
        late_fee_value=float(lease.late_fee_value),
        agreement_date=f"{now.day} {now.strftime('%B %Y')}",
        advance_months=await _advance_payment_months(unit, prop, db, lease=lease),
        minimum_lease_months=minimum_lease_months,
        rolling_date=rolling_date_str,
        max_occupants=max_occupants,
        tenant_signature_data_url=tenant_signature_data_url,
        tenant_signed_at=tenant_signed_at,
        landlord_signature_data_url=landlord_signature_data_url,
        landlord_signed_at=landlord_signed_at,
        landlord_signer_name=landlord_signer_name,
    )


# ── Countersign (manager) ─────────────────────────────────────────────────────

async def presign_agreement(
    lease_id: str,
    signature_data_url: str,
    signer_id: str,
    signer_name: str,
    db: AsyncSession,
) -> dict:
    """
    Manager/landlord pre-signs the agreement before it is sent to the tenant.

    Creates (or updates) a TenancyAgreement record at 'draft' status with the
    landlord's signature stored.  When the tenant later signs during onboarding,
    sign_agreement() detects the pre-signature and immediately advances the
    agreement to 'fully_executed'.

    Available for any non-terminal lease (draft through payment_secured).
    Idempotent: calling again replaces the previous pre-signature.
    """
    lease_uuid = uuid.UUID(lease_id)
    result = await db.execute(select(Lease).where(Lease.id == lease_uuid))
    lease = result.scalar_one_or_none()
    if not lease:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lease not found.")

    _terminal = {LeaseStatus.active, LeaseStatus.expired, LeaseStatus.terminated}
    if lease.status in _terminal:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot pre-sign a '{lease.status.value}' lease. "
                "Use countersign for active leases."
            ),
        )

    now = datetime.now(timezone.utc)

    ta_result = await db.execute(
        select(TenancyAgreement).where(TenancyAgreement.lease_id == lease_uuid)
    )
    ta = ta_result.scalar_one_or_none()

    # Render the agreement HTML with landlord signature (tenant sig pending)
    tenant = await db.scalar(select(Tenant).where(Tenant.id == lease.tenant_id)) if lease.tenant_id else None
    unit, prop = await _get_unit_and_property(lease, db)

    def _fmt_dt(dt) -> str:
        return f"{dt.day} {dt.strftime('%B %Y %H:%M')} UTC"

    rendered_html = await _render_agreement_html(
        lease=lease,
        tenant=tenant,
        unit=unit,
        prop=prop,
        db=db,
        landlord_signature_data_url=signature_data_url,
        landlord_signed_at=_fmt_dt(now),
        landlord_signer_name=signer_name,
        # Carry through any existing tenant signature (shouldn't exist yet, but be safe)
        tenant_signature_data_url=ta.tenant_signature_data_url if ta else None,
        tenant_signed_at=_fmt_dt(ta.tenant_signed_at) if ta and ta.tenant_signed_at else None,
    )

    if ta:
        ta.landlord_signature_data_url = signature_data_url
        ta.landlord_signed_at = now
        ta.landlord_signer_id = signer_id
        ta.landlord_signer_name = signer_name
        ta.rendered_html = rendered_html
        # Upgrade status: if tenant already signed, execute immediately
        if ta.tenant_signed_at:
            ta.status = TenancyAgreementStatus.fully_executed
    else:
        ta = TenancyAgreement(
            lease_id=lease.id,
            rendered_html=rendered_html,
            status=TenancyAgreementStatus.draft,
            landlord_signature_data_url=signature_data_url,
            landlord_signed_at=now,
            landlord_signer_id=signer_id,
            landlord_signer_name=signer_name,
        )
        db.add(ta)

    await db.flush()
    await db.refresh(ta)
    log.info("onboarding.agreement_presigned", lease_id=lease_id, signer_id=signer_id)
    return _tenancy_agreement_dict(ta)


async def countersign_agreement(
    lease_id: str,
    signature_data_url: str,
    signer_id: str,
    signer_name: str,
    db: AsyncSession,
) -> dict:
    """
    Manager countersigns the tenancy agreement.

    Gate: lease must be active (tenant already signed + lease activated).
    Creates/updates the TenancyAgreement record to fully_executed.
    Returns the updated agreement as a dict.
    """
    from sqlalchemy.dialects.postgresql import UUID as PGUUID
    lease_uuid = uuid.UUID(lease_id)
    result = await db.execute(select(Lease).where(Lease.id == lease_uuid))
    lease = result.scalar_one_or_none()
    if not lease:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lease not found.")

    if lease.status != LeaseStatus.active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot countersign — lease is not active (status: {lease.status}).",
        )

    # Find existing TenancyAgreement
    ta_result = await db.execute(
        select(TenancyAgreement).where(TenancyAgreement.lease_id == lease_uuid)
    )
    ta = ta_result.scalar_one_or_none()
    if not ta:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No tenancy agreement record found. Tenant must sign first.",
        )

    if ta.status == TenancyAgreementStatus.fully_executed:
        return _tenancy_agreement_dict(ta)

    now = datetime.now(timezone.utc)
    ta.landlord_signature_data_url = signature_data_url
    ta.landlord_signed_at = now
    ta.landlord_signer_id = signer_id
    ta.landlord_signer_name = signer_name
    ta.status = TenancyAgreementStatus.fully_executed

    # Re-render HTML with landlord signature
    tenant_result = await db.execute(select(Tenant).where(Tenant.id == lease.tenant_id))
    tenant = tenant_result.scalar_one_or_none()
    unit, prop = await _get_unit_and_property(lease, db)

    if tenant:
        def _fmt_dt(dt) -> str:
            return f"{dt.day} {dt.strftime('%B %Y %H:%M')} UTC"

        ta.rendered_html = await _render_agreement_html(
            lease=lease,
            tenant=tenant,
            unit=unit,
            prop=prop,
            db=db,
            tenant_signature_data_url=ta.tenant_signature_data_url,
            tenant_signed_at=_fmt_dt(ta.tenant_signed_at) if ta.tenant_signed_at else None,
            landlord_signature_data_url=signature_data_url,
            landlord_signed_at=_fmt_dt(now),
            landlord_signer_name=signer_name,
        )

    await db.flush()
    await db.refresh(ta)
    log.info("onboarding.agreement_countersigned", lease_id=lease_id, signer_id=signer_id)
    return _tenancy_agreement_dict(ta)


# ── Private helpers ───────────────────────────────────────────────────────────

def _payment_dict(p: Payment) -> dict:
    from app.services.payment_service import _payment_out
    return _payment_out(p).model_dump(by_alias=True)


def _tenancy_agreement_dict(ta: TenancyAgreement) -> dict:
    return {
        "id": str(ta.id),
        "leaseId": str(ta.lease_id),
        "status": ta.status.value,
        "tenantSignedAt": ta.tenant_signed_at.isoformat() if ta.tenant_signed_at else None,
        "landlordSignedAt": ta.landlord_signed_at.isoformat() if ta.landlord_signed_at else None,
        "landlordSignerName": ta.landlord_signer_name,
        "renderedHtml": ta.rendered_html,
    }
