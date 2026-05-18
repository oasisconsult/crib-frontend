"""
Subscription lifecycle management.

Handles:
  - Ensuring every org has a subscription (get_or_create)
  - Plan selection / upgrade / downgrade
  - Status transitions (activate, suspend, cancel, expire)
  - Trial and grace period logic
  - Audit log entries
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.subscription import (
    BillingCycle, BillingCurrency,
    OrganisationSubscription, SubscriptionAuditLog,
    SubscriptionEventType, SubscriptionPlan, SubscriptionStatus,
)


# ── Internal helpers ───────────────────────────────────────────────────────────

async def _get_free_plan(db: AsyncSession) -> SubscriptionPlan:
    result = await db.execute(
        select(SubscriptionPlan).where(SubscriptionPlan.slug == "free")
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise RuntimeError("Free plan not seeded in database. Run migrations.")
    return plan


async def _get_plan_by_id(plan_id: uuid.UUID, db: AsyncSession) -> SubscriptionPlan:
    result = await db.execute(
        select(SubscriptionPlan).where(
            SubscriptionPlan.id == plan_id,
            SubscriptionPlan.is_active == True,
        )
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Subscription plan not found or inactive.")
    return plan


async def _append_audit(
    db: AsyncSession,
    *,
    org_id: uuid.UUID,
    event_type: SubscriptionEventType,
    subscription_id: uuid.UUID | None = None,
    actor_id: uuid.UUID | None = None,
    from_plan_id: uuid.UUID | None = None,
    to_plan_id: uuid.UUID | None = None,
    metadata: dict | None = None,
) -> None:
    entry = SubscriptionAuditLog(
        organisation_id=org_id,
        subscription_id=subscription_id,
        event_type=event_type,
        actor_id=actor_id,
        from_plan_id=from_plan_id,
        to_plan_id=to_plan_id,
        event_metadata=metadata or {},
    )
    db.add(entry)
    await db.flush()  # make visible to subsequent SELECTs (autoflush=False in tests)


async def _get_billing_setting(key: str, default: str, db: AsyncSession) -> str:
    from app.models.system_setting import SystemSetting
    result = await db.execute(
        select(SystemSetting.value).where(SystemSetting.key == key)
    )
    row = result.scalar_one_or_none()
    return row if row is not None else default


# ── Core public API ────────────────────────────────────────────────────────────

async def get_or_create_subscription(
    org_id: uuid.UUID,
    db: AsyncSession,
) -> OrganisationSubscription:
    """
    Return the org's active subscription, creating a Free one if missing.
    Called on every authenticated request that touches billing.
    """
    result = await db.execute(
        select(OrganisationSubscription).where(
            OrganisationSubscription.organisation_id == org_id
        )
    )
    sub = result.scalar_one_or_none()
    if sub:
        return sub

    free_plan = await _get_free_plan(db)
    now = datetime.now(timezone.utc)
    sub = OrganisationSubscription(
        organisation_id=org_id,
        plan_id=free_plan.id,
        status=SubscriptionStatus.active,
        billing_cycle=BillingCycle.none,
        currency=BillingCurrency.UGX,
        current_period_start=now,
    )
    db.add(sub)
    await db.flush()
    await db.refresh(sub)

    await _append_audit(
        db, org_id=org_id, event_type=SubscriptionEventType.created,
        subscription_id=sub.id, to_plan_id=free_plan.id,
        metadata={"auto_created": True},
    )
    return sub


async def get_all_plans(db: AsyncSession) -> list[SubscriptionPlan]:
    result = await db.execute(
        select(SubscriptionPlan)
        .where(SubscriptionPlan.is_publicly_visible == True)
        .order_by(SubscriptionPlan.display_order)
    )
    return list(result.scalars().all())


async def get_all_plans_admin(db: AsyncSession) -> list[SubscriptionPlan]:
    """All plans including hidden ones — for superadmin."""
    result = await db.execute(
        select(SubscriptionPlan).order_by(SubscriptionPlan.display_order)
    )
    return list(result.scalars().all())


async def initiate_plan_change(
    org_id: uuid.UUID,
    plan_id: uuid.UUID,
    billing_cycle: BillingCycle,
    currency: BillingCurrency,
    actor_id: uuid.UUID,
    db: AsyncSession,
) -> OrganisationSubscription:
    """
    Move subscription to pending_payment state so the user can submit proof.
    Free plan is activated immediately (no payment needed).
    """
    sub = await get_or_create_subscription(org_id, db)
    new_plan = await _get_plan_by_id(plan_id, db)

    old_plan_id = sub.plan_id
    old_plan = sub.plan

    # Downgrade guard — free plan can always be selected
    is_upgrade = new_plan.display_order > (old_plan.display_order if old_plan else 0)
    is_downgrade = new_plan.display_order < (old_plan.display_order if old_plan else 0)

    # If selecting free plan, activate immediately
    if new_plan.slug == "free":
        sub.plan_id = new_plan.id
        sub.status = SubscriptionStatus.active
        sub.billing_cycle = BillingCycle.none
        sub.current_period_start = datetime.now(timezone.utc)
        sub.current_period_end = None
        sub.next_invoice_date = None
        sub.price_paid = None
        sub.price_currency = None
        await db.flush()
        await db.refresh(sub)
        event = SubscriptionEventType.downgraded if is_downgrade else SubscriptionEventType.plan_changed
        await _append_audit(
            db, org_id=org_id, subscription_id=sub.id, event_type=event,
            actor_id=actor_id, from_plan_id=old_plan_id, to_plan_id=new_plan.id,
            metadata={"billing_cycle": billing_cycle.value, "currency": currency.value},
        )
        return sub

    # Paid plan — move to pending_payment
    price = new_plan.price_for_cycle(billing_cycle.value, currency.value)
    sub.plan_id = new_plan.id
    sub.status = SubscriptionStatus.pending_payment
    sub.billing_cycle = billing_cycle
    sub.currency = currency
    sub.price_paid = price
    sub.price_currency = currency.value
    await db.flush()
    await db.refresh(sub)

    event = SubscriptionEventType.upgraded if is_upgrade else (
        SubscriptionEventType.downgraded if is_downgrade else SubscriptionEventType.plan_changed
    )
    await _append_audit(
        db, org_id=org_id, subscription_id=sub.id, event_type=event,
        actor_id=actor_id, from_plan_id=old_plan_id, to_plan_id=new_plan.id,
        metadata={"billing_cycle": billing_cycle.value, "currency": currency.value, "price": price},
    )
    return sub


async def activate_subscription(
    sub: OrganisationSubscription,
    actor_id: uuid.UUID | None,
    db: AsyncSession,
) -> OrganisationSubscription:
    """Called by admin after verifying payment."""
    now = datetime.now(timezone.utc)
    trial_days_str = await _get_billing_setting("billing.trial_days", "14", db)
    trial_days = int(trial_days_str)

    if sub.billing_cycle == BillingCycle.monthly:
        period_end = now + timedelta(days=30)
    elif sub.billing_cycle == BillingCycle.annual:
        period_end = now + timedelta(days=365)
    else:
        period_end = None

    # First time on a paid plan with trial available
    plan = sub.plan
    if plan.trial_days > 0 and sub.trial_ends_at is None and sub.status != SubscriptionStatus.trialing:
        sub.status = SubscriptionStatus.trialing
        sub.trial_ends_at = now + timedelta(days=plan.trial_days)
    else:
        sub.status = SubscriptionStatus.active
        sub.trial_ends_at = None

    sub.current_period_start = now
    sub.current_period_end = period_end
    sub.next_invoice_date = period_end
    sub.grace_period_until = None
    await db.flush()
    await db.refresh(sub)

    await _append_audit(
        db, org_id=sub.organisation_id, subscription_id=sub.id,
        event_type=SubscriptionEventType.payment_verified,
        actor_id=actor_id,
        metadata={"period_end": period_end.isoformat() if period_end else None},
    )
    return sub


async def suspend_subscription(
    sub: OrganisationSubscription,
    actor_id: uuid.UUID,
    reason: str,
    db: AsyncSession,
) -> OrganisationSubscription:
    sub.status = SubscriptionStatus.suspended
    await db.flush()
    await db.refresh(sub)
    await _append_audit(
        db, org_id=sub.organisation_id, subscription_id=sub.id,
        event_type=SubscriptionEventType.suspended,
        actor_id=actor_id, metadata={"reason": reason},
    )
    return sub


async def cancel_subscription(
    sub: OrganisationSubscription,
    actor_id: uuid.UUID,
    reason: str | None,
    db: AsyncSession,
) -> OrganisationSubscription:
    sub.status = SubscriptionStatus.cancelled
    sub.cancelled_at = datetime.now(timezone.utc)
    sub.cancellation_reason = reason
    sub.auto_renew = False
    await db.flush()
    await db.refresh(sub)
    await _append_audit(
        db, org_id=sub.organisation_id, subscription_id=sub.id,
        event_type=SubscriptionEventType.cancelled,
        actor_id=actor_id, metadata={"reason": reason},
    )
    return sub


async def start_grace_period(
    sub: OrganisationSubscription,
    db: AsyncSession,
) -> OrganisationSubscription:
    """Move to grace_period when payment proof is pending or period expires."""
    grace_days_str = await _get_billing_setting("billing.grace_period_days", "7", db)
    grace_days = int(grace_days_str)
    now = datetime.now(timezone.utc)
    sub.status = SubscriptionStatus.grace_period
    sub.grace_period_until = now + timedelta(days=grace_days)
    await db.flush()
    await db.refresh(sub)
    grace_iso = sub.grace_period_until.isoformat() if sub.grace_period_until else None  # type: ignore[union-attr]
    await _append_audit(
        db, org_id=sub.organisation_id, subscription_id=sub.id,
        event_type=SubscriptionEventType.grace_period_started,
        metadata={"grace_until": grace_iso},
    )
    return sub


async def expire_subscription(
    sub: OrganisationSubscription,
    db: AsyncSession,
) -> OrganisationSubscription:
    """Downgrade to free plan and mark as expired."""
    free_plan = await _get_free_plan(db)
    old_plan_id = sub.plan_id
    sub.plan_id = free_plan.id
    sub.status = SubscriptionStatus.expired
    sub.grace_period_until = None
    await db.flush()
    await db.refresh(sub)
    await _append_audit(
        db, org_id=sub.organisation_id, subscription_id=sub.id,
        event_type=SubscriptionEventType.expired,
        from_plan_id=old_plan_id, to_plan_id=free_plan.id,
    )
    return sub


async def extend_subscription(
    sub: OrganisationSubscription,
    days: int,
    actor_id: uuid.UUID,
    reason: str | None,
    db: AsyncSession,
) -> OrganisationSubscription:
    """Admin manually extends a subscription."""
    now = datetime.now(timezone.utc)
    base = sub.current_period_end or now
    sub.current_period_end = base + timedelta(days=days)
    sub.next_invoice_date = sub.current_period_end
    if sub.status in (SubscriptionStatus.expired, SubscriptionStatus.suspended,
                      SubscriptionStatus.grace_period):
        sub.status = SubscriptionStatus.active
        sub.grace_period_until = None
    await db.flush()
    await db.refresh(sub)
    new_end_iso = sub.current_period_end.isoformat() if sub.current_period_end else None  # type: ignore[union-attr]
    await _append_audit(
        db, org_id=sub.organisation_id, subscription_id=sub.id,
        event_type=SubscriptionEventType.reinstated,
        actor_id=actor_id,
        metadata={"days_extended": days, "new_end": new_end_iso, "reason": reason},
    )
    return sub


async def update_plan(
    plan_id: uuid.UUID,
    updates: dict,
    db: AsyncSession,
) -> SubscriptionPlan:
    """Superadmin updates plan pricing or limits."""
    result = await db.execute(select(SubscriptionPlan).where(SubscriptionPlan.id == plan_id))
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found.")
    for k, v in updates.items():
        if v is not None:
            setattr(plan, k, v)
    await db.flush()
    await db.refresh(plan)
    return plan


async def get_audit_log(
    org_id: uuid.UUID,
    db: AsyncSession,
    limit: int = 50,
    offset: int = 0,
) -> list[SubscriptionAuditLog]:
    result = await db.execute(
        select(SubscriptionAuditLog)
        .where(SubscriptionAuditLog.organisation_id == org_id)
        .order_by(SubscriptionAuditLog.created_at.desc())
        .limit(limit).offset(offset)
    )
    return list(result.scalars().all())
