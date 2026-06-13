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

from sqlalchemy import Boolean, Date, DateTime, Enum, Float, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
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
    # ── Legacy states (kept for backward compatibility) ───────────────────────
    pending   = "pending"    # awaiting provider / manual confirmation
    confirmed = "confirmed"  # legacy terminal success (= completed for old records)
    failed    = "failed"     # legacy terminal failure (= permanently_failed for old records)
    refunded  = "refunded"   # terminal: payment reversed

    # ── v4 Extended state machine states ─────────────────────────────────────
    # Happy path:
    initiated         = "initiated"          # payment created, not yet analyzed
    predicted         = "predicted"          # failure prediction score assigned
    routed            = "routed"             # channel recommended & selected
    # pending                               # (shared) sent to provider, awaiting callback
    reconciled        = "reconciled"         # provider confirmed receipt
    allocated         = "allocated"          # funds distributed across schedules
    completed         = "completed"          # terminal success, all accounting done

    # Failure paths:
    predicted_failure = "predicted_failure"  # high failure score, blocked before attempt
    retry_scheduled   = "retry_scheduled"    # transient failure, retry queued
    permanently_failed = "permanently_failed" # max retries exceeded or unrecoverable

    # Human-action terminal states:
    rejected  = "rejected"   # org staff declined the payment (wrong amount, duplicate, etc.)
    cancelled = "cancelled"  # tenant withdrew the payment before confirmation


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

    reference: Mapped[str | None] = mapped_column(String(40), nullable=True, unique=True, index=True)

    period_start: Mapped[date] = mapped_column(Date(), nullable=False)
    period_end: Mapped[date] = mapped_column(Date(), nullable=False)
    due_date: Mapped[date] = mapped_column(Date(), nullable=False, index=True)

    amount_due: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    amount_paid: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    late_fee_applied: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)

    status: Mapped[RentScheduleStatus] = mapped_column(
        Enum(
            RentScheduleStatus,
            name="rent_schedule_status_enum",
            native_enum=True,
            create_type=False,  # already created by migrations
        ),
        nullable=False,
        default=RentScheduleStatus.pending,
        index=True,
    )
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text(), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)

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
    category: Mapped[PaymentCategory] = mapped_column(
        Enum(
            PaymentCategory,
            name="payment_category_enum",
            native_enum=True,
            create_type=False,  # already created by migrations
        ),
        nullable=False,
        default=PaymentCategory.rent,
    )
    method: Mapped[PaymentMethod] = mapped_column(
        Enum(
            PaymentMethod,
            name="payment_method_enum",
            native_enum=True,
            create_type=False,  # already created by migrations
        ),
        nullable=False,
        default=PaymentMethod.cash,
    )
    reference: Mapped[str | None] = mapped_column(Text(), nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)

    status: Mapped[PaymentStatus] = mapped_column(
        Enum(
            PaymentStatus,
            name="payment_status_enum",
            native_enum=True,
            create_type=False,  # already created by migrations
        ),
        nullable=False,
        default=PaymentStatus.pending,
        index=True,
    )
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text(), nullable=True)

    # ── Adaptive payment fields (v4 skill) ────────────────────────────────────
    # Populated when a payment fails or is retried via mobile money
    failure_reason: Mapped[str | None] = mapped_column(Text(), nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer(), nullable=False, default=0, server_default="0")

    # Populated by the adaptive routing engine before payment is initiated
    predicted_failure_score: Mapped[float | None] = mapped_column(Float(), nullable=True)
    recommended_channel: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # ── Rejection audit (set when org staff rejects an in-progress payment) ───
    rejection_reason: Mapped[str | None] = mapped_column(Text(), nullable=True)
    rejected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejected_by_profile_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # ── Cancellation audit (set when tenant cancels before confirmation) ──────
    cancellation_reason: Mapped[str | None] = mapped_column(Text(), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # ── Payment evidence (bank transfer / cash receipts) ─────────────────────
    receipt_url: Mapped[str | None] = mapped_column(Text(), nullable=True)

    # ── EFRIS (URA Electronic Fiscal Receipting) ──────────────────────────────
    # pending | issued | failed — null means not yet submitted
    efris_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # URA-assigned Fiscal Document Number (e.g. FD-20260613-12345)
    efris_receipt_number: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    efris_receipt_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    efris_failure_reason: Mapped[str | None] = mapped_column(Text(), nullable=True)
    efris_retry_count: Mapped[int] = mapped_column(Integer(), nullable=False, default=0, server_default="0")
    # S3 URL of the generated fiscal receipt PDF
    efris_fiscal_receipt_url: Mapped[str | None] = mapped_column(Text(), nullable=True)
    # Anti-fake code from URA response (for receipt verification)
    efris_anti_fake_code: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # QR code data string from URA response
    efris_qr_code: Mapped[str | None] = mapped_column(Text(), nullable=True)

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

    status: Mapped[DepositStatus] = mapped_column(
        Enum(
            DepositStatus,
            name="deposit_status_enum",
            native_enum=True,
            create_type=False,  # already created by migrations
        ),
        nullable=False,
        default=DepositStatus.held,
    )
    returned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text(), nullable=True)

    def __repr__(self) -> str:
        return f"<Deposit lease={self.lease_id} held={self.amount_held} status={self.status}>"
