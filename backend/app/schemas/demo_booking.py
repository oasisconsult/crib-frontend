"""Pydantic schemas for the public 'Book a Demo' feature."""

from __future__ import annotations

import uuid
from datetime import date, datetime, time

from pydantic import EmailStr, Field

from app.schemas.common import CamelModel, PaginatedResponse


class DemoContactOut(CamelModel):
    """Public contact email shown on the 'Book a Demo' marketing page."""

    email: str


class DemoBookingCreate(CamelModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    phone: str = Field(min_length=1, max_length=50)
    company: str | None = Field(default=None, max_length=255)
    portfolio_size: str | None = Field(default=None, max_length=50)
    message: str | None = None
    marketing_consent: bool = False

    slot_date: date
    slot_time: time
    timezone: str = "Africa/Kampala"

    # Honeypot — left blank by humans, filled in by bots. Submissions with a
    # non-empty value are silently accepted but never persisted or emailed.
    website: str | None = None


class DemoBookingStatusUpdate(CamelModel):
    status: str  # pending | confirmed | cancelled | completed


class DemoBookingOut(CamelModel):
    id: uuid.UUID
    first_name: str
    last_name: str
    email: str
    phone: str
    company: str | None
    portfolio_size: str | None
    message: str | None
    marketing_consent: bool
    consent_given_at: datetime | None
    slot_date: date
    slot_time: time
    timezone: str
    status: str
    created_at: datetime
    updated_at: datetime


DemoBookingPageOut = PaginatedResponse[DemoBookingOut]
