"""
Subscription payment submission and history.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user
from app.core.database import get_db
from app.schemas.subscription import (
    BillingSettingsOut, SubmitPaymentRequest,
    SubscriptionPaymentOut,
)
from app.services import billing_service

router = APIRouter(prefix="/billing", tags=["billing"])


@router.post("/payments/submit", response_model=SubscriptionPaymentOut, status_code=201)
async def submit_payment(
    body: SubmitPaymentRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubscriptionPaymentOut:
    if not current_user.is_owner_or_manager():
        from fastapi import HTTPException, status
        raise HTTPException(status_code=403, detail="Owner or manager required.")

    # Initiate plan selection first if needed
    await billing_service.billing_service if False else None  # import guard
    from app.services.subscription_service import initiate_plan_change
    from app.models.subscription import BillingCycle, BillingCurrency
    await initiate_plan_change(
        org_id=current_user.profile.organisation_id,
        plan_id=body.plan_id,
        billing_cycle=body.billing_cycle,
        currency=body.currency,
        actor_id=current_user.profile.id,
        db=db,
    )

    payment = await billing_service.submit_payment(
        org_id=current_user.profile.organisation_id,
        data={
            "payment_method": body.payment_method,
            "amount": body.amount,
            "currency": body.currency.value,
            "transaction_reference": body.transaction_reference,
            "phone_number": body.phone_number,
            "account_name": body.account_name,
            "bank_name": body.bank_name,
            "transfer_date": body.transfer_date,
            "proof_file_key": body.proof_file_key,
            "notes": body.notes,
        },
        db=db,
    )
    return payment


@router.get("/payments/history", response_model=dict)
async def payment_history(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    items, total = await billing_service.get_payment_history(
        current_user.profile.organisation_id, db, limit, offset
    )
    return {
        "data": [SubscriptionPaymentOut.model_validate(p) for p in items],
        "total": total,
        "page": offset // limit + 1,
        "pageSize": limit,
        "hasNext": (offset + limit) < total,
    }


@router.get("/payments/{payment_id}", response_model=SubscriptionPaymentOut)
async def get_payment(
    payment_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubscriptionPaymentOut:
    from sqlalchemy import select
    from app.models.subscription import SubscriptionPayment
    result = await db.execute(
        select(SubscriptionPayment).where(
            SubscriptionPayment.id == payment_id,
            SubscriptionPayment.organisation_id == current_user.profile.organisation_id,
        )
    )
    p = result.scalar_one_or_none()
    if not p:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Payment not found.")
    return p


@router.get("/settings", response_model=BillingSettingsOut)
async def get_billing_settings(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BillingSettingsOut:
    """Return bank details and payment instructions for the payment form."""
    settings = await billing_service.get_billing_settings(db)
    return BillingSettingsOut(**settings)
