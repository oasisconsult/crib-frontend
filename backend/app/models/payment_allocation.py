"""
PaymentAllocation — maps one Payment to one or more RentSchedules.

This is the allocation layer that allows:
  - Partial payments (tenant pays less than what is owed)
  - Multi-month payments (one payment covering Jan + Feb rent)
  - Overpayment tracking (remainder goes to wallet)

Every confirmed Payment produces one or more PaymentAllocation rows.
The sum of amount_applied across all allocations for a payment equals
the amount actually applied to schedules (may be < payment.amount if
there was an overpayment that went to the wallet).
"""

from __future__ import annotations

import uuid

from sqlalchemy import Numeric
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import TimestampedBase


class PaymentAllocation(TimestampedBase):
    __tablename__ = "payment_allocations"

    payment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        # FK defined in migration — avoids circular import with Payment
        nullable=False,
        index=True,
    )
    rent_schedule_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    amount_applied: Mapped[float] = mapped_column(
        Numeric(12, 2),
        nullable=False,
    )

    def __repr__(self) -> str:
        return (
            f"<PaymentAllocation payment={self.payment_id} "
            f"schedule={self.rent_schedule_id} applied={self.amount_applied}>"
        )
