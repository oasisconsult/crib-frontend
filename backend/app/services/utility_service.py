"""Utility billing service — record readings and generate payment charges."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lease import Lease, LeaseStatus
from app.models.payment import Payment, PaymentCategory, PaymentMethod, PaymentStatus
from app.models.utility import UtilityReading
from app.schemas.utility import UtilityReadingCreate, UtilityReadingOut


def _out(r: UtilityReading) -> UtilityReadingOut:
    return UtilityReadingOut.model_validate(r)


async def _get_lease(lease_id: uuid.UUID, org_id: uuid.UUID, db: AsyncSession) -> Lease:
    filters = [Lease.id == lease_id, Lease.deleted_at.is_(None)]
    if org_id:
        filters.append(Lease.organisation_id == org_id)
    lease = await db.scalar(select(Lease).where(*filters))
    if not lease:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lease not found")
    return lease


async def record_reading(
    lease_id: uuid.UUID,
    body: UtilityReadingCreate,
    org_id: uuid.UUID,
    created_by_id: uuid.UUID | None,
    db: AsyncSession,
) -> UtilityReadingOut:
    """
    Record a utility reading (or fixed charge) for a lease.

    If `auto_bill` is True (default) a Payment with category="utility" is
    created immediately and linked to the reading.
    """
    lease = await _get_lease(lease_id, org_id, db)

    # Compute consumption / amount
    if body.billing_type == "metered":
        consumed = round(float(body.reading_value) - float(body.previous_value), 3)  # type: ignore[arg-type]
        charge = round(consumed * float(body.unit_price), 2)  # type: ignore[arg-type]
    else:
        consumed = None
        charge = float(body.amount)  # type: ignore[arg-type]

    reading = UtilityReading(
        organisation_id=org_id,
        lease_id=lease_id,
        unit_id=lease.unit_id,
        utility_type=body.utility_type,
        billing_type=body.billing_type,
        reading_date=body.reading_date,
        reading_value=body.reading_value,
        previous_value=body.previous_value,
        units_consumed=consumed,
        unit_price=body.unit_price,
        amount=charge,
        currency=body.currency or lease.currency,
        notes=body.notes,
        is_billed=False,
        created_by_id=created_by_id,
    )
    db.add(reading)
    await db.flush()
    await db.refresh(reading)

    if body.auto_bill:
        await _create_payment(reading, lease, db)

    return _out(reading)


async def _create_payment(
    reading: UtilityReading, lease: Lease, db: AsyncSession
) -> Payment:
    """Create a utility Payment record and link it back to the reading."""
    label = reading.utility_type.replace("_", " ").title()
    now = datetime.now(timezone.utc)
    payment = Payment(
        organisation_id=reading.organisation_id,
        lease_id=reading.lease_id,
        amount=reading.amount,
        currency=reading.currency,
        category=PaymentCategory.utility,
        method=PaymentMethod.cash,
        reference=f"Utility – {label}",
        status=PaymentStatus.initiated,
        paid_at=now,
        notes=reading.notes,
    )
    db.add(payment)
    await db.flush()
    await db.refresh(payment)

    reading.payment_id = payment.id
    reading.is_billed = True
    await db.flush()
    await db.refresh(reading)

    return payment


async def bill_reading(
    reading_id: uuid.UUID,
    org_id: uuid.UUID,
    db: AsyncSession,
) -> UtilityReadingOut:
    """Convert an unbilled reading into a Payment (deferred billing path)."""
    r = await db.scalar(
        select(UtilityReading).where(
            UtilityReading.id == reading_id,
            UtilityReading.organisation_id == org_id,
        )
    )
    if not r:
        raise HTTPException(status_code=404, detail="Utility reading not found")
    if r.is_billed:
        raise HTTPException(status_code=409, detail="Reading is already billed")

    lease = await db.get(Lease, r.lease_id)
    if not lease:
        raise HTTPException(status_code=404, detail="Lease not found")

    await _create_payment(r, lease, db)
    return _out(r)


async def list_readings(
    lease_id: uuid.UUID,
    org_id: uuid.UUID,
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    q = select(UtilityReading).where(
        UtilityReading.lease_id == lease_id,
        UtilityReading.organisation_id == org_id,
    )
    total = (await db.scalar(select(func.count()).select_from(q.subquery()))) or 0
    q = q.order_by(UtilityReading.reading_date.desc()).offset((page - 1) * page_size).limit(page_size)
    rows = list((await db.execute(q)).scalars().all())
    return {
        "data": [_out(r) for r in rows],
        "total": total,
        "page": page,
        "pageSize": page_size,
        "hasNext": (page * page_size) < total,
    }
