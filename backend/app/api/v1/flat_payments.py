"""
Flat (org-level) payment endpoints — no lease_id in the path.

These mirror the lease-nested endpoints but query at the organisation level,
allowing dashboards and reports to list all payments / schedules / late fees
across all leases in one call.

GET  /payments                   list all payments for the org
POST /payments                   create a payment (lease_id in body)
GET  /payments/{id}              get single payment
PATCH /payments/{id}/confirm     confirm a pending payment
PATCH /payments/{id}/refund      refund a confirmed payment
GET  /rent-schedules             list all rent schedules for the org
GET  /late-fees                  list all late fees for the org
"""

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_org_access
from app.core.database import get_db
from app.schemas.payment import PaymentCreateFlat, PaymentOut
from app.services import payment_service as svc

_read  = Depends(require_org_access(allow_tenant_own=True))
_write = Depends(require_org_access(allow_tenant_own=False))


# ── Payments ───────────────────────────────────────────────────────────────────

payments_router = APIRouter(prefix="/payments", tags=["payments"])


@payments_router.get("", response_model=dict)
async def list_payments(
    lease_id: uuid.UUID | None = Query(None, alias="leaseId"),
    payment_status: str | None = Query(None, alias="status"),
    category: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
    current_user=_read,
    db: AsyncSession = Depends(get_db),
):
    """List all payments for the organisation, optionally filtered by lease."""
    return await svc.list_payments_org(
        current_user.org_id,
        db,
        status_filter=payment_status,
        category=category,
        lease_id_filter=lease_id,
        page=page,
        page_size=page_size,
    )


@payments_router.post("", response_model=PaymentOut, status_code=status.HTTP_201_CREATED)
async def create_payment(
    body: PaymentCreateFlat,
    current_user=_write,
    db: AsyncSession = Depends(get_db),
):
    """Create a payment. Supply leaseId and rentScheduleId in the request body."""
    return await svc.create_payment_flat(body, current_user.org_id, db)


@payments_router.get("/{payment_id}", response_model=PaymentOut)
async def get_payment(
    payment_id: uuid.UUID,
    current_user=_read,
    db: AsyncSession = Depends(get_db),
):
    return await svc.get_payment_by_org(payment_id, current_user.org_id, db)


@payments_router.patch("/{payment_id}/confirm", response_model=PaymentOut)
async def confirm_payment(
    payment_id: uuid.UUID,
    current_user=_write,
    db: AsyncSession = Depends(get_db),
):
    return await svc.confirm_payment_by_org(payment_id, current_user.org_id, db)


@payments_router.patch("/{payment_id}/refund", response_model=PaymentOut)
async def refund_payment(
    payment_id: uuid.UUID,
    current_user=_write,
    db: AsyncSession = Depends(get_db),
):
    return await svc.refund_payment_by_org(payment_id, current_user.org_id, db)


# ── Rent Schedules ─────────────────────────────────────────────────────────────

schedules_router = APIRouter(prefix="/rent-schedules", tags=["payments"])


@schedules_router.get("", response_model=dict)
async def list_rent_schedules(
    lease_id: uuid.UUID | None = Query(None, alias="leaseId"),
    schedule_status: str | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=100, alias="pageSize"),
    current_user=_read,
    db: AsyncSession = Depends(get_db),
):
    """List all rent schedules for the organisation, optionally filtered by lease."""
    return await svc.list_schedules_org(
        current_user.org_id,
        db,
        status_filter=schedule_status,
        lease_id_filter=lease_id,
        page=page,
        page_size=page_size,
    )


# ── Late Fees ──────────────────────────────────────────────────────────────────

late_fees_router = APIRouter(prefix="/late-fees", tags=["payments"])


@late_fees_router.get("", response_model=dict)
async def list_late_fees(
    lease_id: uuid.UUID | None = Query(None, alias="leaseId"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
    current_user=_read,
    db: AsyncSession = Depends(get_db),
):
    """List all late fees for the organisation, optionally filtered by lease."""
    return await svc.list_late_fees_org(
        current_user.org_id,
        db,
        lease_id_filter=lease_id,
        page=page,
        page_size=page_size,
    )
