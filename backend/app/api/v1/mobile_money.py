"""
Mobile money transaction management API.

Endpoints:
  GET  /mobile-money                  list all transactions for the org
  GET  /mobile-money/{id}             get single transaction
  PATCH /mobile-money/{id}/match      manually match a transaction to a payment
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_org_access
from app.core.database import get_db
from app.models.mobile_money import MobileMoneyTransaction
from app.schemas.payment import MobileMoneyPageOut, MobileMoneyTransactionOut

router = APIRouter(prefix="/mobile-money", tags=["mobile-money"])

_read  = Depends(require_org_access(allow_tenant_own=False))
_write = Depends(require_org_access(allow_tenant_own=False))


def _fmt(t: MobileMoneyTransaction) -> MobileMoneyTransactionOut:
    return MobileMoneyTransactionOut(
        id=str(t.id),
        organisation_id=str(t.organisation_id),
        provider=t.provider,
        external_id=t.external_id,
        phone_number=t.phone_number,
        amount=float(t.amount),
        currency=t.currency,
        status=t.status,
        received_at=t.received_at.isoformat() if t.received_at else None,
        matched_payment_id=str(t.matched_payment_id) if t.matched_payment_id else None,
        reference_id=t.reference_id,
        created_at=t.created_at.isoformat(),
        updated_at=t.updated_at.isoformat(),
    )


@router.get("", response_model=MobileMoneyPageOut)
async def list_mobile_money_transactions(
    status_filter: str | None = Query(None, alias="status"),
    provider: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200, alias="pageSize"),
    current_user=_read,
    db: AsyncSession = Depends(get_db),
):
    """List mobile money transactions for the organisation."""
    from sqlalchemy import func

    q = select(MobileMoneyTransaction).where(
        MobileMoneyTransaction.organisation_id == current_user.org_id
    )
    if status_filter:
        q = q.where(MobileMoneyTransaction.status == status_filter)
    if provider:
        q = q.where(MobileMoneyTransaction.provider == provider.upper())

    total = await db.scalar(select(func.count()).select_from(q.subquery())) or 0
    q = (
        q.order_by(MobileMoneyTransaction.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await db.execute(q)
    rows = list(result.scalars().all())

    return MobileMoneyPageOut(
        data=[_fmt(t) for t in rows],
        total=total,
        page=page,
        page_size=page_size,
        has_next=(page * page_size) < total,
    )


@router.get("/{transaction_id}", response_model=MobileMoneyTransactionOut)
async def get_mobile_money_transaction(
    transaction_id: uuid.UUID,
    current_user=_read,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(MobileMoneyTransaction).where(
            MobileMoneyTransaction.id == transaction_id,
            MobileMoneyTransaction.organisation_id == current_user.org_id,
        )
    )
    txn = result.scalar_one_or_none()
    if not txn:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found")
    return _fmt(txn)


@router.patch("/{transaction_id}/match", response_model=MobileMoneyTransactionOut)
async def manually_match_transaction(
    transaction_id: uuid.UUID,
    current_user=_write,
    db: AsyncSession = Depends(get_db),
):
    """
    Manually trigger the matching engine for an unmatched transaction.
    Useful for admin re-tries after a tenant's phone number is updated.
    """
    from app.services.matching_service import match_transaction

    result = await db.execute(
        select(MobileMoneyTransaction).where(
            MobileMoneyTransaction.id == transaction_id,
            MobileMoneyTransaction.organisation_id == current_user.org_id,
        )
    )
    txn = result.scalar_one_or_none()
    if not txn:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found")

    if txn.status not in ("unmatched", "received"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot match a transaction with status '{txn.status}'",
        )

    # Force status to received so matching engine will process it
    txn.status = "received"
    await db.flush()

    await match_transaction(db, txn)
    await db.flush()
    await db.refresh(txn)
    return _fmt(txn)
