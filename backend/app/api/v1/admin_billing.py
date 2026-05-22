"""
Admin billing management — superadmin only.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, require_role
from app.core.database import get_db
from app.schemas.common import MessageResponse
from app.schemas.subscription import (
    AdminExtendSubscriptionRequest, AdminOverridePlanRequest,
    BillingAnalyticsOut, BillingSettingsOut, BillingSettingsUpdate,
    OrganisationSubscriptionOut, RejectPaymentRequest,
    SubscriptionPaymentOut, SubscriptionPlanOut, SubscriptionPlanUpdate,
    VerifyPaymentRequest,
)
from app.services import billing_service, subscription_service
from app.models.subscription import (
    OrganisationSubscription, SubscriptionPayment, SubscriptionPaymentStatus,
)
from app.models.organisation import Organisation

router = APIRouter(
    prefix="/admin/billing",
    tags=["admin-billing"],
    dependencies=[Depends(require_role("superadmin"))],
)


# ── Plan management ────────────────────────────────────────────────────────────

@router.get("/plans", response_model=list[SubscriptionPlanOut])
async def admin_list_plans(db: AsyncSession = Depends(get_db)) -> list:
    return await subscription_service.get_all_plans_admin(db)


@router.patch("/plans/{plan_id}", response_model=SubscriptionPlanOut)
async def admin_update_plan(
    plan_id: uuid.UUID,
    body: SubscriptionPlanUpdate,
    db: AsyncSession = Depends(get_db),
) -> SubscriptionPlanOut:
    updates = body.model_dump(exclude_none=True)
    return await subscription_service.update_plan(plan_id, updates, db)


# ── Subscription management ────────────────────────────────────────────────────

@router.get("/subscriptions", response_model=dict)
async def admin_list_subscriptions(
    status: str | None = Query(None),
    plan_slug: str | None = Query(None),
    search: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> dict:
    from sqlalchemy import func
    from app.models.subscription import SubscriptionStatus, SubscriptionPlan

    q = (
        select(OrganisationSubscription, Organisation.name.label("org_name"))
        .join(SubscriptionPlan, OrganisationSubscription.plan_id == SubscriptionPlan.id)
        .outerjoin(Organisation, OrganisationSubscription.organisation_id == Organisation.id)
    )
    if status:
        q = q.where(OrganisationSubscription.status == status)
    if plan_slug:
        q = q.where(SubscriptionPlan.slug == plan_slug)
    if search:
        q = q.where(Organisation.name.ilike(f"%{search}%"))

    count_q = select(func.count()).select_from(q.subquery())
    total = (await db.execute(count_q)).scalar_one() or 0
    rows = (await db.execute(
        q.order_by(OrganisationSubscription.created_at.desc()).limit(limit).offset(offset)
    )).fetchall()
    data = []
    for row in rows:
        sub = row[0]
        out = OrganisationSubscriptionOut.model_validate(sub).model_dump()
        out["orgName"] = row[1] or "—"
        data.append(out)
    return {"data": data, "total": total, "page": offset // limit + 1,
            "pageSize": limit, "hasNext": (offset + limit) < total}


@router.post("/subscriptions/{subscription_id}/extend", response_model=OrganisationSubscriptionOut)
async def admin_extend_subscription(
    subscription_id: uuid.UUID,
    body: AdminExtendSubscriptionRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrganisationSubscriptionOut:
    result = await db.execute(select(OrganisationSubscription).where(OrganisationSubscription.id == subscription_id))
    sub = result.scalar_one_or_none()
    if not sub:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Subscription not found.")
    return await subscription_service.extend_subscription(sub, body.days, current_user.profile.id, body.reason, db)


@router.post("/subscriptions/{subscription_id}/suspend", response_model=OrganisationSubscriptionOut)
async def admin_suspend_subscription(
    subscription_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    reason: str = Query(..., min_length=5),
    db: AsyncSession = Depends(get_db),
) -> OrganisationSubscriptionOut:
    result = await db.execute(select(OrganisationSubscription).where(OrganisationSubscription.id == subscription_id))
    sub = result.scalar_one_or_none()
    if not sub:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Subscription not found.")
    return await subscription_service.suspend_subscription(sub, current_user.profile.id, reason, db)


@router.post("/subscriptions/{subscription_id}/override-plan", response_model=OrganisationSubscriptionOut)
async def admin_override_plan(
    subscription_id: uuid.UUID,
    body: AdminOverridePlanRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrganisationSubscriptionOut:
    result = await db.execute(select(OrganisationSubscription).where(OrganisationSubscription.id == subscription_id))
    sub = result.scalar_one_or_none()
    if not sub:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Subscription not found.")
    return await subscription_service.initiate_plan_change(
        org_id=sub.organisation_id,
        plan_id=body.plan_id,
        billing_cycle=body.billing_cycle,
        currency=sub.currency,
        actor_id=current_user.profile.id,
        db=db,
    )


# ── Payment verification ───────────────────────────────────────────────────────

@router.get("/payments/pending", response_model=dict)
async def list_pending_payments(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> dict:
    from sqlalchemy import func
    q = select(SubscriptionPayment).where(
        SubscriptionPayment.status == SubscriptionPaymentStatus.pending_verification
    )
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one() or 0
    q_with_org = (
        select(SubscriptionPayment, Organisation.name.label("org_name"))
        .outerjoin(Organisation, SubscriptionPayment.organisation_id == Organisation.id)
        .where(SubscriptionPayment.status == SubscriptionPaymentStatus.pending_verification)
    )
    rows = (await db.execute(q_with_org.order_by(SubscriptionPayment.submitted_at.asc()).limit(limit).offset(offset))).fetchall()
    data = []
    for row in rows:
        p = row[0]
        out = SubscriptionPaymentOut.model_validate(p).model_dump()
        out["orgName"] = row[1] or "—"
        data.append(out)
    return {"data": data, "total": total, "page": offset // limit + 1, "pageSize": limit, "hasNext": (offset + limit) < total}


@router.post("/payments/{payment_id}/verify", response_model=SubscriptionPaymentOut)
async def verify_payment(
    payment_id: uuid.UUID,
    body: VerifyPaymentRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubscriptionPaymentOut:
    return await billing_service.verify_payment(payment_id, current_user.profile.id, body.notes, db)


@router.post("/payments/{payment_id}/reject", response_model=SubscriptionPaymentOut)
async def reject_payment(
    payment_id: uuid.UUID,
    body: RejectPaymentRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubscriptionPaymentOut:
    return await billing_service.reject_payment(payment_id, current_user.profile.id, body.reason, db)


# ── Billing settings ───────────────────────────────────────────────────────────

@router.get("/settings", response_model=BillingSettingsOut)
async def get_billing_settings(db: AsyncSession = Depends(get_db)) -> BillingSettingsOut:
    settings = await billing_service.get_billing_settings(db)
    return BillingSettingsOut(**settings)


@router.patch("/settings", response_model=BillingSettingsOut)
async def update_billing_settings(
    body: BillingSettingsUpdate,
    db: AsyncSession = Depends(get_db),
) -> BillingSettingsOut:
    updates = body.model_dump(exclude_none=True)
    settings = await billing_service.update_billing_settings(updates, db)
    return BillingSettingsOut(**settings)


# ── Analytics ──────────────────────────────────────────────────────────────────

@router.get("/analytics", response_model=dict)
async def get_analytics(db: AsyncSession = Depends(get_db)) -> dict:
    """Real-time KPIs: MRR, ARR, revenue YTD/MTD, churn rate, plan breakdown."""
    return await billing_service.get_billing_analytics(db)


@router.get("/analytics/charts", response_model=dict)
async def get_analytics_charts(db: AsyncSession = Depends(get_db)) -> dict:
    """Time-series chart data: revenue trend, growth, status distribution, plan distribution."""
    return await billing_service.get_billing_analytics_charts(db)
