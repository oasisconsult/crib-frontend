"""
Notification domain models.

Two tables:
  notification_templates — reusable per-org templates with {{variable}} placeholders
  notifications          — one row per delivery attempt; tracks full state lifecycle

State machine (notifications):
  queued → sent → delivered → read
       ↘ failed (from queued or sent)
  failed → queued (retry)
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TimestampedBase, Base


# ── Enums ──────────────────────────────────────────────────────────────────────

class NotificationChannel(str, enum.Enum):
    whatsapp = "whatsapp"
    email    = "email"
    sms      = "sms"
    in_app   = "in_app"


class NotificationTrigger(str, enum.Enum):
    rent_due             = "rent_due"
    rent_overdue         = "rent_overdue"
    lease_expiry         = "lease_expiry"
    lease_activated      = "lease_activated"
    onboarding_invite    = "onboarding_invite"
    document_ready       = "document_ready"
    inspection_scheduled = "inspection_scheduled"
    maintenance_update   = "maintenance_update"
    payment_confirmed    = "payment_confirmed"
    payment_failed       = "payment_failed"
    late_fee_applied     = "late_fee_applied"
    deposit_received     = "deposit_received"
    notice_given         = "notice_given"       # Tenant notice to vacate submitted
    notice_retracted     = "notice_retracted"   # Notice to vacate withdrawn by manager
    lease_terminated     = "lease_terminated"   # Lease forcibly terminated by manager
    bulk_announcement    = "bulk_announcement"  # Manager-composed broadcast to all tenants
    inspector_invite     = "inspector_invite"   # Inspector assigned to an inspection
    custom               = "custom"


class NotificationState(str, enum.Enum):
    queued    = "queued"
    sent      = "sent"
    delivered = "delivered"
    read      = "read"
    failed    = "failed"


# ── Models ─────────────────────────────────────────────────────────────────────

class NotificationTemplate(TimestampedBase):
    __tablename__ = "notification_templates"

    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organisations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    trigger: Mapped[str] = mapped_column(String(64), nullable=False)
    channel: Mapped[str] = mapped_column(String(20), nullable=False)
    subject: Mapped[str | None] = mapped_column(String(500), nullable=True)
    body: Mapped[str] = mapped_column(Text(), nullable=False)
    variables: Mapped[list] = mapped_column(JSONB(), nullable=False, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return f"<NotificationTemplate {self.name!r} trigger={self.trigger} channel={self.channel}>"


class Notification(Base):
    """
    Notification uses Base (not TimestampedBase) because it has no updated_at —
    notifications are append-only delivery records; only queued_at and state
    timestamps are tracked.
    """
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organisations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    template_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("notification_templates.id", ondelete="SET NULL"),
        nullable=True,
    )
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )

    channel: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    trigger: Mapped[str] = mapped_column(String(64), nullable=False)

    recipient_name: Mapped[str] = mapped_column(String(255), nullable=False)
    recipient_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    recipient_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)

    subject: Mapped[str | None] = mapped_column(String(500), nullable=True)
    body: Mapped[str] = mapped_column(Text(), nullable=False)

    state: Mapped[str] = mapped_column(String(20), nullable=False, default="queued", index=True)

    queued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    failed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    failure_reason: Mapped[str | None] = mapped_column(Text(), nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer(), nullable=False, default=0)
    external_message_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Context links
    property_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("properties.id", ondelete="SET NULL"), nullable=True
    )
    lease_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("leases.id", ondelete="SET NULL"), nullable=True
    )
    payment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("payments.id", ondelete="SET NULL"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    def __repr__(self) -> str:
        return f"<Notification channel={self.channel} trigger={self.trigger} state={self.state}>"
