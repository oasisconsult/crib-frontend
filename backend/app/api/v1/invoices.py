"""
Invoice retrieval endpoints.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user
from app.core.database import get_db
from app.schemas.subscription import SubscriptionInvoiceOut
from app.services import billing_service

router = APIRouter(prefix="/invoices", tags=["invoices"])


@router.get("", response_model=dict)
async def list_invoices(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    items, total = await billing_service.get_invoices(
        current_user.profile.organisation_id, db, limit, offset
    )
    return {
        "data": items,
        "total": total,
        "page": offset // limit + 1,
        "pageSize": limit,
        "hasNext": (offset + limit) < total,
    }


@router.get("/{invoice_id}", response_model=SubscriptionInvoiceOut)
async def get_invoice(
    invoice_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubscriptionInvoiceOut:
    from sqlalchemy import select
    from app.models.subscription import SubscriptionInvoice
    from fastapi import HTTPException
    result = await db.execute(
        select(SubscriptionInvoice).where(
            SubscriptionInvoice.id == invoice_id,
            SubscriptionInvoice.organisation_id == current_user.profile.organisation_id,
        )
    )
    inv = result.scalar_one_or_none()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found.")
    return inv
