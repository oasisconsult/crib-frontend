"""
Billing service — payment proof submission and invoice generation.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.subscription import (
    InvoiceStatus, OrganisationSubscription,
    SubscriptionAuditLog, SubscriptionEventType,
    SubscriptionInvoice, SubscriptionPayment,
    SubscriptionPaymentStatus, SubscriptionStatus,
)
from app.services.subscription_service import (
    activate_subscription, _append_audit, _get_billing_setting,
    get_or_create_subscription, start_grace_period,
)


# ── Invoice generation ─────────────────────────────────────────────────────────

async def _next_invoice_number(db: AsyncSession) -> str:
    prefix = await _get_billing_setting("billing.invoice_prefix", "CR-INV", db)
    year = datetime.now(timezone.utc).year
    result = await db.execute(
        select(func.count()).select_from(SubscriptionInvoice).where(
            SubscriptionInvoice.invoice_number.like(f"{prefix}-{year}-%")
        )
    )
    seq = (result.scalar_one() or 0) + 1
    return f"{prefix}-{year}-{seq:05d}"


async def generate_invoice(
    sub: OrganisationSubscription,
    db: AsyncSession,
) -> SubscriptionInvoice:
    """Create a draft invoice for the current billing cycle."""
    vat_rate_str = await _get_billing_setting("billing.vat_rate_percent", "18", db)
    vat_rate = float(vat_rate_str) / 100

    plan = sub.plan
    price = sub.price_paid or plan.price_for_cycle(
        sub.billing_cycle.value, (sub.price_currency or sub.currency.value)
    )
    currency = sub.price_currency or sub.currency.value

    subtotal = price
    tax_amount = round(subtotal * vat_rate)
    total = subtotal + tax_amount
    invoice_number = await _next_invoice_number(db)

    invoice = SubscriptionInvoice(
        organisation_id=sub.organisation_id,
        subscription_id=sub.id,
        invoice_number=invoice_number,
        subtotal=subtotal,
        tax_amount=tax_amount,
        total=total,
        currency=currency,
        period_start=sub.current_period_start,
        period_end=sub.current_period_end,
        status=InvoiceStatus.issued,
        line_items=[
            {
                "description": f"{plan.name} Plan — {sub.billing_cycle.value.title()} Subscription",
                "quantity": 1,
                "unit_price": subtotal,
                "amount": subtotal,
            }
        ],
    )
    db.add(invoice)
    await db.flush()
    return invoice


# ── Payment submission ─────────────────────────────────────────────────────────

async def submit_payment(
    org_id: uuid.UUID,
    data: dict,
    db: AsyncSession,
) -> SubscriptionPayment:
    """
    User submits proof of payment.
    Moves subscription to pending_verification.
    """
    sub = await get_or_create_subscription(org_id, db)

    # Generate invoice if one doesn't exist yet
    invoice = await generate_invoice(sub, db)

    now = datetime.now(timezone.utc)
    payment = SubscriptionPayment(
        organisation_id=org_id,
        subscription_id=sub.id,
        invoice_id=invoice.id,
        payment_method=data["payment_method"],
        amount=data["amount"],
        currency=data.get("currency", "UGX"),
        transaction_reference=data.get("transaction_reference"),
        phone_number=data.get("phone_number"),
        account_name=data.get("account_name"),
        bank_name=data.get("bank_name"),
        transfer_date=data.get("transfer_date"),
        proof_file_key=data.get("proof_file_key"),
        proof_uploaded_at=now if data.get("proof_file_key") else None,
        status=SubscriptionPaymentStatus.pending_verification,
        submitted_at=now,
        notes=data.get("notes"),
    )
    db.add(payment)

    # Update subscription status
    sub.status = SubscriptionStatus.pending_verification
    await db.flush()

    await _append_audit(
        db, org_id=org_id, subscription_id=sub.id,
        event_type=SubscriptionEventType.payment_submitted,
        metadata={
            "payment_id": str(payment.id),
            "method": data["payment_method"].value if hasattr(data["payment_method"], "value") else data["payment_method"],
            "amount": data["amount"],
            "currency": data.get("currency", "UGX"),
        },
    )
    return payment


async def verify_payment(
    payment_id: uuid.UUID,
    admin_profile_id: uuid.UUID,
    notes: str | None,
    db: AsyncSession,
) -> SubscriptionPayment:
    """Admin approves a payment — activates the subscription."""
    result = await db.execute(
        select(SubscriptionPayment).where(SubscriptionPayment.id == payment_id)
    )
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found.")
    if payment.status != SubscriptionPaymentStatus.pending_verification:
        raise HTTPException(status_code=400, detail=f"Payment is in '{payment.status}' status, cannot verify.")

    now = datetime.now(timezone.utc)
    payment.status = SubscriptionPaymentStatus.verified
    payment.verified_by_id = admin_profile_id
    payment.verified_at = now
    if notes:
        payment.notes = notes

    # Mark invoice as paid
    if payment.invoice_id:
        inv_result = await db.execute(
            select(SubscriptionInvoice).where(SubscriptionInvoice.id == payment.invoice_id)
        )
        invoice = inv_result.scalar_one_or_none()
        if invoice:
            invoice.status = InvoiceStatus.paid
            invoice.paid_at = now

    # Activate subscription
    sub_result = await db.execute(
        select(OrganisationSubscription).where(
            OrganisationSubscription.id == payment.subscription_id
        )
    )
    sub = sub_result.scalar_one_or_none()
    if sub:
        await activate_subscription(sub, admin_profile_id, db)

    await db.flush()
    return payment


async def reject_payment(
    payment_id: uuid.UUID,
    admin_profile_id: uuid.UUID,
    reason: str,
    db: AsyncSession,
) -> SubscriptionPayment:
    """Admin rejects a payment — moves subscription back to pending_payment."""
    result = await db.execute(
        select(SubscriptionPayment).where(SubscriptionPayment.id == payment_id)
    )
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found.")
    if payment.status != SubscriptionPaymentStatus.pending_verification:
        raise HTTPException(status_code=400, detail="Payment cannot be rejected in current state.")

    payment.status = SubscriptionPaymentStatus.rejected
    payment.verified_by_id = admin_profile_id
    payment.verified_at = datetime.now(timezone.utc)
    payment.rejection_reason = reason

    # Move subscription back to pending
    sub_result = await db.execute(
        select(OrganisationSubscription).where(
            OrganisationSubscription.id == payment.subscription_id
        )
    )
    sub = sub_result.scalar_one_or_none()
    if sub:
        sub.status = SubscriptionStatus.pending_payment

    await _append_audit(
        db, org_id=payment.organisation_id, subscription_id=payment.subscription_id,
        event_type=SubscriptionEventType.payment_rejected,
        actor_id=admin_profile_id,
        metadata={"payment_id": str(payment_id), "reason": reason},
    )
    await db.flush()
    return payment


# ── Billing history ────────────────────────────────────────────────────────────

async def get_payment_history(
    org_id: uuid.UUID,
    db: AsyncSession,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[SubscriptionPayment], int]:
    count_q = select(func.count()).select_from(SubscriptionPayment).where(
        SubscriptionPayment.organisation_id == org_id
    )
    total = (await db.execute(count_q)).scalar_one() or 0

    items_q = (
        select(SubscriptionPayment)
        .where(SubscriptionPayment.organisation_id == org_id)
        .order_by(SubscriptionPayment.created_at.desc())
        .limit(limit).offset(offset)
    )
    items = list((await db.execute(items_q)).scalars().all())
    return items, total


async def get_invoices(
    org_id: uuid.UUID,
    db: AsyncSession,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[SubscriptionInvoice], int]:
    count_q = select(func.count()).select_from(SubscriptionInvoice).where(
        SubscriptionInvoice.organisation_id == org_id
    )
    total = (await db.execute(count_q)).scalar_one() or 0

    items_q = (
        select(SubscriptionInvoice)
        .where(SubscriptionInvoice.organisation_id == org_id)
        .order_by(SubscriptionInvoice.created_at.desc())
        .limit(limit).offset(offset)
    )
    items = list((await db.execute(items_q)).scalars().all())
    return items, total


# ── Billing settings helpers ───────────────────────────────────────────────────

async def get_billing_settings(db: AsyncSession) -> dict:
    """Read all billing.* system settings into a flat dict."""
    from app.models.system_setting import SystemSetting
    result = await db.execute(
        select(SystemSetting).where(SystemSetting.category == "billing")
    )
    rows = result.scalars().all()
    mapping = {r.key: r.value for r in rows}
    return {
        "vat_rate_percent":   float(mapping.get("billing.vat_rate_percent", "18")),
        "trial_days":         int(mapping.get("billing.trial_days", "14")),
        "grace_period_days":  int(mapping.get("billing.grace_period_days", "7")),
        "invoice_prefix":     mapping.get("billing.invoice_prefix", "CR-INV"),
        "bank_name":          mapping.get("billing.bank.name", ""),
        "bank_account_name":  mapping.get("billing.bank.account_name", ""),
        "bank_account_number":mapping.get("billing.bank.account_number", ""),
        "bank_branch":        mapping.get("billing.bank.branch", ""),
        "bank_swift_code":    mapping.get("billing.bank.swift_code", ""),
        "bank_sort_code":     mapping.get("billing.bank.sort_code", ""),
        "mtn_number":         mapping.get("billing.mtn_momo.number", ""),
        "mtn_name":           mapping.get("billing.mtn_momo.name", ""),
        "airtel_number":      mapping.get("billing.airtel.number", ""),
        "airtel_name":        mapping.get("billing.airtel.name", ""),
        "cash_instructions":  mapping.get("billing.cash.instructions", ""),
    }


async def update_billing_settings(updates: dict, db: AsyncSession) -> dict:
    """Upsert billing.* system settings."""
    from app.models.system_setting import SystemSetting
    key_map = {
        "vat_rate_percent":    "billing.vat_rate_percent",
        "trial_days":          "billing.trial_days",
        "grace_period_days":   "billing.grace_period_days",
        "invoice_prefix":      "billing.invoice_prefix",
        "bank_name":           "billing.bank.name",
        "bank_account_name":   "billing.bank.account_name",
        "bank_account_number": "billing.bank.account_number",
        "bank_branch":         "billing.bank.branch",
        "bank_swift_code":     "billing.bank.swift_code",
        "bank_sort_code":      "billing.bank.sort_code",
        "mtn_number":          "billing.mtn_momo.number",
        "mtn_name":            "billing.mtn_momo.name",
        "airtel_number":       "billing.airtel.number",
        "airtel_name":         "billing.airtel.name",
        "cash_instructions":   "billing.cash.instructions",
    }
    for field, db_key in key_map.items():
        val = updates.get(field)
        if val is None:
            continue
        result = await db.execute(select(SystemSetting).where(SystemSetting.key == db_key))
        row = result.scalar_one_or_none()
        if row:
            row.value = str(val)
        else:
            db.add(SystemSetting(key=db_key, value=str(val), category="billing", label=field))
    await db.flush()
    return await get_billing_settings(db)


# ── Admin analytics ────────────────────────────────────────────────────────────

async def get_billing_analytics(db: AsyncSession) -> dict:
    from sqlalchemy import case
    result = await db.execute(
        select(
            func.count().label("total"),
            func.sum(case((OrganisationSubscription.status == "active", 1), else_=0)).label("active"),
            func.sum(case((OrganisationSubscription.status == "trialing", 1), else_=0)).label("trialing"),
            func.sum(case((OrganisationSubscription.status == "suspended", 1), else_=0)).label("suspended"),
            func.sum(case((OrganisationSubscription.status == "cancelled", 1), else_=0)).label("cancelled"),
        )
    )
    row = result.one()

    pending = (await db.execute(
        select(func.count()).select_from(SubscriptionPayment).where(
            SubscriptionPayment.status == SubscriptionPaymentStatus.pending_verification
        )
    )).scalar_one() or 0

    return {
        "total_active_subscriptions": (row.active or 0) + (row.trialing or 0),
        "total_trialing": row.trialing or 0,
        "total_suspended": row.suspended or 0,
        "total_cancelled": row.cancelled or 0,
        "pending_verifications": pending,
        "mrr_ugx": 0,
        "mrr_usd_cents": 0,
        "plan_breakdown": [],
    }
