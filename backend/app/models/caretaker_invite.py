"""
CaretakerInvite model.

An owner invites a caretaker to manage a subset of their properties.
The caretaker gets delegated access scoped to the listed property_ids.
"""
from __future__ import annotations

import uuid

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TimestampedBase


class CaretakerInviteStatus:
    PENDING  = "pending"
    ACCEPTED = "accepted"
    EXPIRED  = "expired"
    REVOKED  = "revoked"


class CaretakerInvite(TimestampedBase):
    __tablename__ = "caretaker_invites"

    # The owner / superadmin who sent the invite
    owner_profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Caretaker personal details (pre-filled by the inviting owner)
    email:      Mapped[str]        = mapped_column(String(255), nullable=False)
    first_name: Mapped[str]        = mapped_column(String(100), nullable=False)
    last_name:  Mapped[str]        = mapped_column(String(100), nullable=False)
    phone:      Mapped[str | None] = mapped_column(String(50),  nullable=True)

    # JSONB list of property UUIDs (as strings) the owner is delegating
    property_ids: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    # "full" = all operational + financial access
    # "operations_only" = no payments / analytics
    permission_level: Mapped[str] = mapped_column(
        String(30), nullable=False, default="full"
    )

    token:  Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False,
                                         default=CaretakerInviteStatus.PENDING)

    accepted_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at:  Mapped[DateTime]        = mapped_column(DateTime(timezone=True), nullable=False)

    def __repr__(self) -> str:
        return f"<CaretakerInvite {self.email!r} status={self.status}>"
