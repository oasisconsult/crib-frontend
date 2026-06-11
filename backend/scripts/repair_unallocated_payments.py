"""
One-time repair script: allocate completed payments that were confirmed via
confirm_payment_by_org() before the allocation-engine bug was fixed.

Finds all payments in status=completed that have no PaymentAllocation rows
and runs the standard allocation engine against them.

Run inside the container:
  docker exec crib-backend-1 python scripts/repair_unallocated_payments.py

Dry-run by default. Pass --apply to write changes.
"""

from __future__ import annotations

import asyncio
import sys

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.models.payment import Payment, PaymentCategory, PaymentStatus
from app.models.payment_allocation import PaymentAllocation

settings = get_settings()
DRY_RUN = "--apply" not in sys.argv


async def main() -> None:
    engine = create_async_engine(settings.database_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        # Find completed/confirmed rent payments with no allocation rows
        completed = (
            await db.execute(
                select(Payment).where(
                    Payment.status.in_([PaymentStatus.completed, PaymentStatus.confirmed]),
                    Payment.category == PaymentCategory.rent,
                )
            )
        ).scalars().all()

        orphans: list[Payment] = []
        for p in completed:
            has_alloc = await db.scalar(
                select(PaymentAllocation).where(PaymentAllocation.payment_id == p.id)
            )
            if not has_alloc:
                orphans.append(p)

        if not orphans:
            print("No unallocated completed payments found. Nothing to do.")
            return

        print(f"Found {len(orphans)} completed payment(s) with no allocation:")
        for p in orphans:
            print(f"  payment={p.id}  lease={p.lease_id}  amount={p.amount}  status={p.status}")

        if DRY_RUN:
            print("\nDRY RUN — pass --apply to write changes.")
            return

        from app.services.payment_allocation_service import allocate_payment
        from app.services.wallet_service import credit_wallet
        from app.services.ledger_service import create_ledger_entry
        from app.models.lease import Lease

        for p in orphans:
            print(f"\nAllocating payment {p.id} (amount={p.amount}) ...")
            lease = await db.scalar(select(Lease).where(Lease.id == p.lease_id))
            if not lease:
                print(f"  SKIP — lease {p.lease_id} not found")
                continue

            overpayment = await allocate_payment(db, p.lease_id, p)
            print(f"  allocated — overpayment={overpayment}")

            if overpayment > 0 and lease.tenant_id:
                await credit_wallet(
                    db,
                    tenant_id=lease.tenant_id,
                    organisation_id=lease.organisation_id,
                    amount=overpayment,
                    reference_type="overpayment",
                    reference_id=p.id,
                    description=f"Retroactive overpayment credit from payment {p.id}",
                )
                await create_ledger_entry(
                    db,
                    organisation_id=lease.organisation_id,
                    lease_id=p.lease_id,
                    entry_type="credit",
                    amount=overpayment,
                    reference_type="overpayment",
                    reference_id=p.id,
                    description=f"Retroactive overpayment of {overpayment} credited to wallet",
                )
                print(f"  credited {overpayment} to tenant wallet")

        await db.commit()
        print("\nDone. All unallocated payments have been allocated.")

    await engine.dispose()


asyncio.run(main())
