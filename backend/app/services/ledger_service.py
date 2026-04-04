"""
Ledger service — immutable audit trail for every lease's financial events.

The ledger is append-only. No rows are ever updated or deleted.
Each entry carries a running balance_after so the current balance can be
read from the most-recent row without summing the entire history.

Positive balance_after = tenant owes money (net debit position).
Negative balance_after = tenant has credit (net overpayment).
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ledger import LedgerEntry


async def get_last_balance(db: AsyncSession, lease_id: uuid.UUID) -> float:
    """Return the current running balance for a lease (0.0 if no entries yet)."""
    result = await db.execute(
        select(LedgerEntry)
        .where(LedgerEntry.lease_id == lease_id)
        .order_by(LedgerEntry.seq.desc())
        .limit(1)
    )
    last = result.scalar_one_or_none()
    return float(last.balance_after) if last else 0.0


async def create_ledger_entry(
    db: AsyncSession,
    *,
    organisation_id: uuid.UUID,
    lease_id: uuid.UUID,
    entry_type: str,          # "credit" | "debit"
    amount: float,
    reference_type: str,      # "payment" | "refund" | "late_fee" | "deposit" | "overpayment" | "wallet"
    reference_id: uuid.UUID,
    description: str | None = None,
) -> LedgerEntry:
    """
    Append one ledger entry and return it (not yet committed).

    Balance convention:
      debit  → balance increases  (tenant owes more)
      credit → balance decreases  (tenant owes less / has credit)
    """
    last_balance = await get_last_balance(db, lease_id)

    if entry_type == "debit":
        new_balance = round(last_balance + float(amount), 2)
    else:  # credit
        new_balance = round(last_balance - float(amount), 2)

    entry = LedgerEntry(
        organisation_id=organisation_id,
        lease_id=lease_id,
        entry_type=entry_type,
        amount=float(amount),
        reference_type=reference_type,
        reference_id=reference_id,
        balance_after=new_balance,
        description=description,
    )
    db.add(entry)
    await db.flush()
    return entry


async def get_ledger_entries(
    db: AsyncSession,
    lease_id: uuid.UUID,
    page: int = 1,
    page_size: int = 50,
) -> dict:
    """Return paginated ledger entries for a lease, newest first."""
    from sqlalchemy import func

    q = select(LedgerEntry).where(LedgerEntry.lease_id == lease_id)
    total = await db.scalar(select(func.count()).select_from(q.subquery())) or 0
    q = (
        q.order_by(LedgerEntry.seq.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await db.execute(q)
    entries = result.scalars().all()
    return {
        "data": entries,
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_next": (page * page_size) < total,
        "current_balance": entries[0].balance_after if entries else 0.0,
    }
