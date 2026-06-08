"""DemoBooking model — 'Book a Demo' submissions from the public marketing site."""
from __future__ import annotations

from datetime import date, datetime, time

from sqlalchemy import Boolean, Date, DateTime, String, Text, Time
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TimestampedBase


class DemoBookingStatus:
    PENDING   = "pending"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"
    COMPLETED = "completed"


class DemoBooking(TimestampedBase):
    __tablename__ = "demo_bookings"

    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name:  Mapped[str] = mapped_column(String(100), nullable=False)
    email:      Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    phone:      Mapped[str] = mapped_column(String(50),  nullable=False)

    company:        Mapped[str | None] = mapped_column(String(255), nullable=True)
    portfolio_size: Mapped[str | None] = mapped_column(String(50),  nullable=True)
    message:        Mapped[str | None] = mapped_column(Text,        nullable=True)

    # Consent to receive communications about the booking and product updates.
    # consent_given_at provides an auditable record of when opt-in occurred.
    marketing_consent: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    consent_given_at:  Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    slot_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    slot_time: Mapped[time] = mapped_column(Time, nullable=False)
    timezone:  Mapped[str] = mapped_column(String(50), nullable=False, default="Africa/Kampala")

    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=DemoBookingStatus.PENDING, index=True,
    )

    def __repr__(self) -> str:
        return f"<DemoBooking {self.first_name} {self.last_name} {self.slot_date} {self.slot_time} status={self.status}>"
