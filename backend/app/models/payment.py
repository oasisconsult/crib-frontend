"""
Payment domain models.

Four tables:
  rent_schedules  — one row per billing period per lease (auto-generated on activation)
  payments        — individual payment events against a schedule
  late_fees       — one calculated late fee per overdue schedule
  deposits        — one deposit record per lease (created on activation if deposit_amount > 0)

Status machines:
  RentSchedule: pending → paid | overdue | waived
  Payment:      pending → confirmed | failed | refunded
  Deposit:      held → partially_returned | fully_returned | forfeited
"""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import TimestampedBase


# ── Enums ──────────────────────────────────────────────────────────────────────

class RentScheduleStatus(str, enum.Enum):
    pending  = "pending"
    paid     = "paid"
    overdue  = "overdue"
    waived   = "waived"


class PaymentCategory(str, enum.Enum):
    rent      = "rent"
    deposit   = "deposit"
    late_fee  = "late_fee"
    other     = "other"


class PaymentMethod(str, enum.Enum):
    cash                 = "cash"
    bank_transfer        = "bank_transfer"
    mobile_money_mtn     = "mobile_money_mtn"
    mobile_money_airtel  = "mobile_money_airtel"
    other                = "other"


class PaymentStatus(str, enum.Enum):
    pending   = "pending"
    confirmed = "confirmed"
    failed    = "failed"
    refunded  = "refunded"


class DepositStatus(str, enum.Enum):
    held               = "held"
    partially_returned = "partially_returned"
    fully_returned     = "fully_returned"
    forfeited          = "forfeited"


# ── Models ─────────────────────────────────────────────────────────────────────

class RentSchedule(TimestampedBase):
    __tablename__ = "rent_schedules"

    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organisations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    lease_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("leases.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    period_start: Mapped[date] = mapped_column(Date(), nullable=False)
    period_end: Mapped[date] = mapped_column(Date(), nullable=False)
    due_date: Mapped[date] = mapped_column(Date(), nullable=False, index=True)

    amount_due: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    amount_paid: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    late_fee_applied: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text(), nullable=True)

    # Relationships
    payments: Mapped[list["Payment"]] = relationship(
        "Payment", back_populates="rent_schedule", cascade="all, delete-orphan"
    )
    late_fee: Mapped["LateFee | None"] = relationship(
        "LateFee", back_populates="rent_schedule", uselist=False, cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<RentSchedule lease={self.lease_id} period={self.period_start} status={self.status}>"


class Payment(TimestampedBase):
    __tablename__ = "payments"

    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organisations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    lease_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("leases.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    rent_schedule_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("rent_schedules.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )

    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="UGX")
    category: Mapped[str] = mapped_column(String(20), nullable=False, default="rent")
    method: Mapped[str] = mapped_column(String(30), nullable=False, default="cash")
    reference: Mapped[str | None] = mapped_column(Text(), nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text(), nullable=True)

    # Relationships
    rent_schedule: Mapped["RentSchedule | None"] = relationship(
        "RentSchedule", back_populates="payments"
    )

    def __repr__(self) -> str:
        return f"<Payment lease={self.lease_id} amount={self.amount} status={self.status}>"


class LateFee(TimestampedBase):
    __tablename__ = "late_fees"
    __table_args__ = (UniqueConstraint("rent_schedule_id", name="uq_late_fee_schedule"),)

    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organisations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    lease_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("leases.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    rent_schedule_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("rent_schedules.id", ondelete="CASCADE"),
        nullable=False,
    )

    fee_type: Mapped[str] = mapped_column(String(20), nullable=False)  # flat | percent
    calculated_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    applied_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    waived: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=False)
    waived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    waived_reason: Mapped[str | None] = mapped_column(Text(), nullable=True)

    # Relationships
    rent_schedule: Mapped["RentSchedule"] = relationship(
        "RentSchedule", back_populates="late_fee"
    )

    def __repr__(self) -> str:
        return f"<LateFee schedule={self.rent_schedule_id} amount={self.calculated_amount} waived={self.waived}>"


class Deposit(TimestampedBase):
    __tablename__ = "deposits"
    __table_args__ = (UniqueConstraint("lease_id", name="uq_deposit_lease"),)

    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organisations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    lease_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("leases.id", ondelete="CASCADE"),
        nullable=False,
    )

    amount_held: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    amount_returned: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    deductions: Mapped[list] = mapped_column(JSONB(), nullable=False, default=list)
    # deductions format: [{"reason": str, "amount": float}]

    status: Mapped[str] = mapped_column(String(30), nullable=False, default="held")
    returned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text(), nullable=True)

    def __repr__(self) -> str:
        return f"<Deposit lease={self.lease_id} held={self.amount_held} status={self.status}>"
