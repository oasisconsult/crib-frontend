"""SQLAlchemy model for rent increase notices (Uganda LTA 2022)."""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime

import sqlalchemy as sa
from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TimestampedBase


class RentIncreaseStatus(str, enum.Enum):
    pending_ack  = "pending_ack"   # issued, awaiting tenant acknowledgement
    acknowledged = "acknowledged"  # tenant has acknowledged
    applied      = "applied"       # increase applied to lease on effective_date
    withdrawn    = "withdrawn"     # landlord withdrew the notice


class RentIncrease(TimestampedBase):
    """
    A formal rent increase notice under Uganda LTA 2022.

    Constraints enforced at service layer:
      - new_rent > current_rent
      - increase_pct <= 10%
      - effective_date >= issued_at + 90 days
      - only one pending/acknowledged notice per lease at a time
    """
    __tablename__ = "rent_increases"

    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organisations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    lease_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("leases.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    property_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("properties.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
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

    issued_by: Mapped[str] = mapped_column(String(255), nullable=False)

    status: Mapped[RentIncreaseStatus] = mapped_column(
        sa.Enum(
            RentIncreaseStatus,
            name="rent_increase_status_enum",
            create_type=False,
        ),
        nullable=False,
        default=RentIncreaseStatus.pending_ack,
        index=True,
    )

    current_rent: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    new_rent: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    increase_pct: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)

    effective_date: Mapped[date] = mapped_column(Date, nullable=False)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    withdrawn_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    notice_pdf_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:  # pragma: no cover
        return f"<RentIncrease lease={self.lease_id} {self.current_rent}→{self.new_rent} {self.status}>"
