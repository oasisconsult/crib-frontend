"""
LedgerEntry — immutable double-entry audit trail per lease.

Each financial event (payment confirmed, refund, late fee applied,
deposit credited) appends a row here. The rows are NEVER updated or
deleted — they are the source of truth for dispute resolution.

entry_type:
  "credit" — money received (payment confirmed, wallet debit applied to rent)
  "debit"  — money owed or reversed (rent due, refund, late fee)

reference_type values:
  "payment"    — a confirmed Payment
  "refund"     — a refunded Payment
  "late_fee"   — a LateFee applied
  "deposit"    — a deposit Payment confirmed
  "overpayment"— leftover after allocation, credited to wallet
  "wallet"     — wallet balance applied to a schedule

balance_after reflects the running tenant balance for this lease:
  positive = tenant owes money (net debit)
  negative = tenant has credit (net overpayment)
"""

from __future__ import annotations

import uuid

from sqlalchemy import BigInteger, Numeric, Sequence, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedBase

_ledger_seq = Sequence("ledger_entries_seq", metadata=Base.metadata)


class LedgerEntry(TimestampedBase):
    __tablename__ = "ledger_entries"

    # Monotonically increasing sequence — used for stable ORDER BY in get_last_balance.
    seq: Mapped[int] = mapped_column(
        BigInteger,
        _ledger_seq,
        server_default=_ledger_seq.next_value(),
        nullable=False,
        index=True,
    )

    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    lease_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
        index=True,
    )

    entry_type: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
    )  # "credit" | "debit"

    amount: Mapped[float] = mapped_column(
        Numeric(12, 2),
        nullable=False,
    )

    reference_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )  # "payment" | "refund" | "late_fee" | "deposit" | "overpayment" | "wallet"

    reference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
        index=True,
    )

    balance_after: Mapped[float] = mapped_column(
        Numeric(12, 2),
        nullable=False,
    )

    description: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    def __repr__(self) -> str:
        return (
            f"<LedgerEntry lease={self.lease_id} type={self.entry_type} "
            f"amount={self.amount} ref={self.reference_type} balance_after={self.balance_after}>"
        )
