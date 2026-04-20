"""
LandlordInvite + LandlordPropertyAccess models.

LandlordInvite   — a manager/superadmin invites an individual landlord.
LandlordPropertyAccess — which properties a landlord profile can view.
"""
from __future__ import annotations

import uuid

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TimestampedBase


class InviteStatus:
    PENDING  = "pending"
    ACCEPTED = "accepted"
    EXPIRED  = "expired"
    REVOKED  = "revoked"


class LandlordInvite(TimestampedBase):
    __tablename__ = "landlord_invites"

    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organisations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    invited_by_profile_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )

    email:      Mapped[str]       = mapped_column(String(255), nullable=False)
    first_name: Mapped[str]       = mapped_column(String(100), nullable=False)
    last_name:  Mapped[str]       = mapped_column(String(100), nullable=False)
    phone:      Mapped[str | None] = mapped_column(String(50),  nullable=True)

    # UUIDs of the specific properties this landlord owns
    property_ids: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    message: Mapped[str | None] = mapped_column(Text, nullable=True)

    token:  Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default=InviteStatus.PENDING)

    accepted_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at:  Mapped[DateTime]        = mapped_column(DateTime(timezone=True), nullable=False)

    def __repr__(self) -> str:
        return f"<LandlordInvite {self.email!r} status={self.status}>"


class LandlordPropertyAccess(TimestampedBase):
    __tablename__ = "landlord_property_access"
    __table_args__ = (
        UniqueConstraint("landlord_profile_id", "property_id", name="uq_landlord_property_access"),
    )

    landlord_profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    property_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    is_read_only: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    granted_by_profile_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )

    def __repr__(self) -> str:
        return (
            f"<LandlordPropertyAccess landlord={self.landlord_profile_id} "
            f"property={self.property_id} read_only={self.is_read_only}>"
        )
