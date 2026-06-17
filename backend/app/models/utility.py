"""Utility billing model — meter readings and fixed charges billed to tenants."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TimestampedBase


class UtilityReading(TimestampedBase):
    """
    One row per utility charge event for a lease.

    billing_type == "metered": charge is computed from (reading_value - previous_value) * unit_price.
    billing_type == "fixed":   charge is the directly supplied `amount`.
    """

    __tablename__ = "utility_readings"

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
    unit_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("units.id", ondelete="SET NULL"),
        nullable=True,
    )
    # "water" | "electricity" | "internet" | "garbage" | "other"
    utility_type: Mapped[str] = mapped_column(String(32), nullable=False)
    # "metered" — reading_value / previous_value / unit_price drive the amount
    # "fixed"   — amount is supplied directly
    billing_type: Mapped[str] = mapped_column(String(16), nullable=False, default="fixed")
    reading_date: Mapped[date] = mapped_column(Date, nullable=False)
    # Metered fields
    reading_value: Mapped[float | None] = mapped_column(Numeric(14, 3), nullable=True)
    previous_value: Mapped[float | None] = mapped_column(Numeric(14, 3), nullable=True)
    units_consumed: Mapped[float | None] = mapped_column(Numeric(14, 3), nullable=True)
    unit_price: Mapped[float | None] = mapped_column(Numeric(12, 4), nullable=True)
    # Final charge amount (computed or supplied)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="UGX")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Set once payment is created from this reading
    payment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("payments.id", ondelete="SET NULL"),
        nullable=True,
    )
    is_billed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<UtilityReading {self.id} type={self.utility_type} amount={self.amount}>"
