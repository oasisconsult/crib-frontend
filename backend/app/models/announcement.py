"""Announcement model — bulk broadcast to all active tenants in an org."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TimestampedBase


class Announcement(TimestampedBase):
    """
    One row per broadcast composed by a manager.

    Individual per-tenant Notification records are created as children of each
    announcement and delivered via the existing notification pipeline.
    """

    __tablename__ = "announcements"

    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organisations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    # List of channel slugs: ["in_app"], ["email"], ["in_app", "email"], etc.
    channels: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    # "active_tenants" — reserved for future filter options
    target_audience: Mapped[str] = mapped_column(
        String(32), nullable=False, default="active_tenants"
    )
    # Set after fan-out completes
    sent_to_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Announcement {self.id} org={self.organisation_id} sent_to={self.sent_to_count}>"
