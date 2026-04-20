"""AgencyInvite model — superadmin invites a new property agency onto the platform."""
from __future__ import annotations

import uuid

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TimestampedBase


class AgencyInviteStatus:
    PENDING  = "pending"
    ACCEPTED = "accepted"
    EXPIRED  = "expired"
    REVOKED  = "revoked"


class AgencyInvite(TimestampedBase):
    __tablename__ = "agency_invites"

    invited_by_profile_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Pre-filled by superadmin; editable by the agency during onboarding
    agency_name:        Mapped[str] = mapped_column(String(255), nullable=False)
    manager_email:      Mapped[str] = mapped_column(String(255), nullable=False)
    manager_first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    manager_last_name:  Mapped[str] = mapped_column(String(100), nullable=False)

    # Filled in during onboarding
    agency_phone:         Mapped[str | None] = mapped_column(String(50),  nullable=True)
    agency_contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    agency_country:       Mapped[str | None] = mapped_column(String(2),   nullable=True)
    agency_currency:      Mapped[str | None] = mapped_column(String(3),   nullable=True)
    agency_address:       Mapped[str | None] = mapped_column(Text,        nullable=True)

    # Linked once onboarding completes
    organisation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organisations.id", ondelete="SET NULL"),
        nullable=True,
    )

    token:  Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default=AgencyInviteStatus.PENDING)

    accepted_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at:  Mapped[DateTime]        = mapped_column(DateTime(timezone=True), nullable=False)

    def __repr__(self) -> str:
        return f"<AgencyInvite {self.agency_name!r} status={self.status}>"
