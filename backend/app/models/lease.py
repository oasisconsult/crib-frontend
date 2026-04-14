"""
Lease model.

A Lease is the formal tenancy agreement between an Organisation (landlord)
and a Tenant for a specific Unit.

Lifecycle:
  draft → active  (activate — updates unit + tenant cached FKs)
  active → terminated  (early exit)
  active → expired     (natural end, manual or future cron)
  active/expired → [new draft with renewal_of_lease_id] → active  (renewal)
"""

import enum
import uuid
from datetime import date, datetime

import sqlalchemy as sa
from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Numeric, SmallInteger, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import TimestampedBase


class LeaseStatus(str, enum.Enum):
    draft                = "draft"
    # ── Tenant onboarding flow ─────────────────────────────────────────────────
    onboarding_started   = "onboarding_started"   # tenant opened link, lease linked
    agreement_previewed  = "agreement_previewed"  # tenant saw terms snapshot
    terms_accepted       = "terms_accepted"        # tenant explicitly accepted terms
    payment_pending      = "payment_pending"       # payment records created, awaiting confirmation
    payment_secured      = "payment_secured"       # all onboarding payments confirmed
    agreement_signed     = "agreement_signed"      # tenant signed final agreement
    # ── Live states ────────────────────────────────────────────────────────────
    active               = "active"
    expired              = "expired"
    terminated           = "terminated"


class Lease(TimestampedBase):
    __tablename__ = "leases"

    # ── Scope ──────────────────────────────────────────────────────────────────
    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organisations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    property_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("properties.id", ondelete="CASCADE"),
        nullable=False,
    )
    unit_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("units.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # ── Status ─────────────────────────────────────────────────────────────────
    status: Mapped[LeaseStatus] = mapped_column(
        # create_type=False: don't emit CREATE TYPE — migration 004 already created
        # lease_status_enum in the DB. Using sa.Enum here tells asyncpg to bind
        # the value as the correct enum type instead of VARCHAR.
        sa.Enum(LeaseStatus, name="lease_status_enum", create_type=False),
        nullable=False,
        default=LeaseStatus.draft,
    )

    # ── Terms ──────────────────────────────────────────────────────────────────
    start_date: Mapped[date] = mapped_column(Date(), nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date(), nullable=True)        # None = rolling
    monthly_rent: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="UGX")
    deposit_amount: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    deposit_paid: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=False)
    deposit_paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # ── Advance payment override (set at lease creation; None → use system default) ──
    advance_months: Mapped[int | None] = mapped_column(SmallInteger(), nullable=True)

    # ── Billing rules (copied from effective rules at draft creation) ───────────
    rent_day_of_month: Mapped[int] = mapped_column(SmallInteger(), nullable=False, default=1)
    grace_period_days: Mapped[int] = mapped_column(SmallInteger(), nullable=False, default=5)
    late_fee_type: Mapped[str] = mapped_column(String(20), nullable=False, default="flat")
    late_fee_value: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    notice_period_days: Mapped[int] = mapped_column(SmallInteger(), nullable=False, default=30)

    # ── Lifecycle metadata ─────────────────────────────────────────────────────
    signed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notice_given_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    terminated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    termination_reason: Mapped[str | None] = mapped_column(Text(), nullable=True)

    # ── Renewal chain ──────────────────────────────────────────────────────────
    renewal_of_lease_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("leases.id", ondelete="SET NULL"),
        nullable=True,
    )

    notes: Mapped[str | None] = mapped_column(Text(), nullable=True)

    # ── Onboarding flow ────────────────────────────────────────────────────────
    # Snapshot of terms shown to tenant at preview time; compared at signing
    agreement_preview_snapshot: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # Snapshot built at signing time; must equal preview_snapshot (strict equality)
    final_agreement_snapshot: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # When tenant explicitly accepted terms (legal anchor)
    terms_accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Set when lease becomes active via onboarding (vs manager direct-activate)
    onboarding_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # List of Payment UUIDs created during onboarding (deposit + advance rent)
    onboarding_payment_ids: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    # ── Relationships ──────────────────────────────────────────────────────────
    renewal_of: Mapped["Lease | None"] = relationship(
        "Lease",
        remote_side="Lease.id",
        foreign_keys=[renewal_of_lease_id],
        back_populates="renewals",
    )
    renewals: Mapped[list["Lease"]] = relationship(
        "Lease",
        back_populates="renewal_of",
        foreign_keys=[renewal_of_lease_id],
    )

    def __repr__(self) -> str:
        return f"<Lease unit={self.unit_id} tenant={self.tenant_id} status={self.status}>"
