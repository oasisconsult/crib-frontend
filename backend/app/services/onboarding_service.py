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
    unit: Unit, prop: Property, db: AsyncSession
) -> int:
    """Effective advance months: unit rules → property rules → system setting."""
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

    # Idempotent: already previewed — return stored snapshot
    if lease.status == LeaseStatus.agreement_previewed and lease.agreement_preview_snapshot:
        return _snapshot_to_preview(
            lease.agreement_preview_snapshot,
            lease.agreement_preview_snapshot.get("generatedAt", ""),
        )

    allowed_entry = {LeaseStatus.draft, LeaseStatus.onboarding_started, LeaseStatus.agreement_previewed}
    if lease.status not in allowed_entry:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot preview agreement from status '{lease.status}'. "
                   f"Current step: {_LEASE_STATUS_TO_STEP.get(lease.status, 'unknown')}",
        )

    unit, prop = await _get_unit_and_property(lease, db)
    advance_months = await _advance_payment_months(unit, prop, db)
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

    return _snapshot_to_preview(snapshot, now.isoformat())


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

    # Idempotent
    if lease.status == LeaseStatus.terms_accepted:
        return TermsAcceptOut(
            lease_id=str(lease.id),
            status=lease.status.value,
            terms_accepted_at=lease.terms_accepted_at.isoformat(),
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
        if existing and existing.status != PaymentStatus.failed:
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

    all_confirmed = bool(payments) and all(
        p.status == PaymentStatus.confirmed for p in payments
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

    # Only confirm if still pending
    p = await db.scalar(select(Payment).where(Payment.id == p_uuid, Payment.lease_id == lease.id))
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found.")

    if p.status == PaymentStatus.pending:
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

    return OnboardingPaymentOut(
        lease_id=str(lease.id),
        lease_status=lease.status.value,
        payments=[_payment_dict(p) for p in payments],
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
    log.info("onboarding.lease_activated", lease_id=str(lease.id), tenant_id=str(tenant.id))


# ── Private helpers ───────────────────────────────────────────────────────────

def _payment_dict(p: Payment) -> dict:
    from app.services.payment_service import _payment_out
    return _payment_out(p).model_dump(by_alias=True)
