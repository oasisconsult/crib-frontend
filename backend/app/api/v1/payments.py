"""
Payments REST API — nested under /leases/{lease_id}.

Endpoints:
  POST   /leases/{id}/schedules/generate
  GET    /leases/{id}/schedules
  GET    /leases/{id}/schedules/{sid}
  PATCH  /leases/{id}/schedules/{sid}/waive
  POST   /leases/{id}/payments
  GET    /leases/{id}/payments
  GET    /leases/{id}/payments/export
  GET    /leases/{id}/payments/{pid}
  PATCH  /leases/{id}/payments/{pid}/confirm
  PATCH  /leases/{id}/payments/{pid}/refund
  GET    /leases/{id}/payments/{pid}/allocations
  GET    /leases/{id}/late-fees
  POST   /leases/{id}/late-fees/{schedule_id}/apply
  PATCH  /leases/{id}/late-fees/{fid}/waive
  GET    /leases/{id}/deposit
  PATCH  /leases/{id}/deposit/return
  GET    /leases/{id}/ledger
  GET    /leases/{id}/ledger/entries
"""

import uuid

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_org_access
from app.core.database import get_db
from app.schemas.payment import (
    DepositOut,
    DepositReturn,
    LateFeeOut,
    LateFeeWaive,
    LedgerEntryOut,
    LedgerOut,
    LedgerPageOut,
    PaymentAllocationOut,
    PaymentCreate,
    PaymentOut,
    RentScheduleOut,
)
from app.services import payment_service as svc
from app.services.ledger_service import get_ledger_entries
from app.services.payment_allocation_service import get_allocations_for_payment

router = APIRouter(prefix="/leases", tags=["payments"])

_read  = Depends(require_org_access(allow_tenant_own=True))
_write = Depends(require_org_access(allow_tenant_own=False))


# ── Rent Schedules ─────────────────────────────────────────────────────────────

@router.post(
    "/{lease_id}/schedules/generate",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def generate_schedules(
    lease_id: uuid.UUID,
    current_user=_write,
    db: AsyncSession = Depends(get_db),
):
    """Manually re-generate rent schedules (e.g. after lease extension)."""
    from app.models.lease import Lease
    from sqlalchemy import select
    from fastapi import HTTPException

    result = await db.execute(
        select(Lease).where(Lease.id == lease_id, Lease.organisation_id == current_user.org_id)
    )
    lease = result.scalar_one_or_none()
    if not lease:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lease not found")
    await svc.generate_rent_schedules(lease, db)
    await db.flush()


@router.get("/{lease_id}/schedules", response_model=dict)
async def list_schedules(
    lease_id: uuid.UUID,
    schedule_status: str | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=100, alias="pageSize"),
    current_user=_read,
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_schedules(lease_id, current_user.org_id, db, schedule_status, page, page_size)


@router.get("/{lease_id}/schedules/{schedule_id}", response_model=RentScheduleOut)
async def get_schedule(
    lease_id: uuid.UUID,
    schedule_id: uuid.UUID,
    current_user=_read,
    db: AsyncSession = Depends(get_db),
):
    return await svc.get_schedule(schedule_id, lease_id, current_user.org_id, db)


@router.patch("/{lease_id}/schedules/{schedule_id}/waive", response_model=RentScheduleOut)
async def waive_schedule(
    lease_id: uuid.UUID,
    schedule_id: uuid.UUID,
    current_user=_write,
    db: AsyncSession = Depends(get_db),
):
    return await svc.waive_schedule(schedule_id, lease_id, current_user.org_id, db)


# ── Payments ───────────────────────────────────────────────────────────────────

# NOTE: /payments/export must be registered BEFORE /{pid} to prevent FastAPI
# matching "export" as a UUID payment ID.

@router.get("/{lease_id}/payments/export")
async def export_payments(
    lease_id: uuid.UUID,
    current_user=_read,
    db: AsyncSession = Depends(get_db),
):
    csv_data = await svc.export_payments_csv(lease_id, current_user.org_id, db)
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="payments_{lease_id}.csv"'},
    )


@router.post(
    "/{lease_id}/payments",
    response_model=PaymentOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_payment(
    lease_id: uuid.UUID,
    body: PaymentCreate,
    current_user=_write,
    db: AsyncSession = Depends(get_db),
):
    return await svc.create_payment(lease_id, body, current_user.org_id, db)


@router.get("/{lease_id}/payments", response_model=dict)
async def list_payments(
    lease_id: uuid.UUID,
    payment_status: str | None = Query(None, alias="status"),
    category: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
    current_user=_read,
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_payments(lease_id, current_user.org_id, db, payment_status, category, page, page_size)


@router.get("/{lease_id}/payments/{payment_id}", response_model=PaymentOut)
async def get_payment(
    lease_id: uuid.UUID,
    payment_id: uuid.UUID,
    current_user=_read,
    db: AsyncSession = Depends(get_db),
):
    return await svc.get_payment(payment_id, lease_id, current_user.org_id, db)


@router.patch("/{lease_id}/payments/{payment_id}/confirm", response_model=PaymentOut)
async def confirm_payment(
    lease_id: uuid.UUID,
    payment_id: uuid.UUID,
    current_user=_write,
    db: AsyncSession = Depends(get_db),
):
    return await svc.confirm_payment(payment_id, lease_id, current_user.org_id, db)


@router.patch("/{lease_id}/payments/{payment_id}/refund", response_model=PaymentOut)
async def refund_payment(
    lease_id: uuid.UUID,
    payment_id: uuid.UUID,
    current_user=_write,
    db: AsyncSession = Depends(get_db),
):
    return await svc.refund_payment(payment_id, lease_id, current_user.org_id, db)


@router.get(
    "/{lease_id}/payments/{payment_id}/allocations",
    response_model=list[PaymentAllocationOut],
)
async def list_payment_allocations(
    lease_id: uuid.UUID,
    payment_id: uuid.UUID,
    current_user=_read,
    db: AsyncSession = Depends(get_db),
):
    """Return all allocation rows showing how a payment was distributed across schedules."""
    # Verify the payment belongs to this lease / org before exposing allocations.
    await svc.get_payment(payment_id, lease_id, current_user.org_id, db)
    allocations = await get_allocations_for_payment(db, payment_id)
    return [
        PaymentAllocationOut(
            id=str(a.id),
            payment_id=str(a.payment_id),
            rent_schedule_id=str(a.rent_schedule_id),
            amount_applied=float(a.amount_applied),
            created_at=a.created_at.isoformat(),
            updated_at=a.updated_at.isoformat(),
        )
        for a in allocations
    ]


# ── Late Fees ──────────────────────────────────────────────────────────────────

@router.get("/{lease_id}/late-fees", response_model=list[LateFeeOut])
async def list_late_fees(
    lease_id: uuid.UUID,
    current_user=_read,
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_late_fees(lease_id, current_user.org_id, db)


@router.post(
    "/{lease_id}/late-fees/{schedule_id}/apply",
    response_model=LateFeeOut,
    status_code=status.HTTP_201_CREATED,
)
async def apply_late_fee(
    lease_id: uuid.UUID,
    schedule_id: uuid.UUID,
    current_user=_write,
    db: AsyncSession = Depends(get_db),
):
    return await svc.apply_late_fee(schedule_id, lease_id, current_user.org_id, db)


@router.patch("/{lease_id}/late-fees/{fee_id}/waive", response_model=LateFeeOut)
async def waive_late_fee(
    lease_id: uuid.UUID,
    fee_id: uuid.UUID,
    body: LateFeeWaive,
    current_user=_write,
    db: AsyncSession = Depends(get_db),
):
    return await svc.waive_late_fee(fee_id, lease_id, current_user.org_id, body, db)


# ── Deposit ────────────────────────────────────────────────────────────────────

@router.get("/{lease_id}/deposit", response_model=DepositOut)
async def get_deposit(
    lease_id: uuid.UUID,
    current_user=_read,
    db: AsyncSession = Depends(get_db),
):
    return await svc.get_deposit(lease_id, current_user.org_id, db)


@router.patch("/{lease_id}/deposit/return", response_model=DepositOut)
async def return_deposit(
    lease_id: uuid.UUID,
    body: DepositReturn,
    current_user=_write,
    db: AsyncSession = Depends(get_db),
):
    return await svc.return_deposit(lease_id, body, current_user.org_id, db)


# ── Ledger ─────────────────────────────────────────────────────────────────────

@router.get("/{lease_id}/ledger", response_model=LedgerOut)
async def get_ledger(
    lease_id: uuid.UUID,
    current_user=_read,
    db: AsyncSession = Depends(get_db),
):
    """Computed ledger summary (totals). Use /ledger/entries for the full audit trail."""
    return await svc.get_ledger(lease_id, current_user.org_id, db)


@router.get("/{lease_id}/ledger/entries", response_model=LedgerPageOut)
async def list_ledger_entries(
    lease_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200, alias="pageSize"),
    current_user=_read,
    db: AsyncSession = Depends(get_db),
):
    """Paginated immutable audit trail for this lease, newest-first."""
    # Verify lease belongs to this org.
    await svc._get_lease_checked(lease_id, current_user.org_id, db)
    raw = await get_ledger_entries(db, lease_id, page=page, page_size=page_size)
    return LedgerPageOut(
        data=[
            LedgerEntryOut(
                id=str(e.id),
                organisation_id=str(e.organisation_id),
                lease_id=str(e.lease_id),
                entry_type=e.entry_type,
                amount=float(e.amount),
                reference_type=e.reference_type,
                reference_id=str(e.reference_id),
                balance_after=float(e.balance_after),
                description=e.description,
                created_at=e.created_at.isoformat(),
                updated_at=e.updated_at.isoformat(),
            )
            for e in raw["data"]
        ],
        total=raw["total"],
        page=raw["page"],
        page_size=raw["page_size"],
        has_next=raw["has_next"],
        current_balance=raw["current_balance"],
    )
