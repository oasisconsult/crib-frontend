"""
EFRIS (URA Electronic Fiscal Receipting and Invoicing System) domain models.

Two tables:
  organisation_efris_configs — per-org credentials and settings (one row per org)
  efris_audit_log            — append-only trace of every EFRIS API interaction
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import TimestampedBase, Base


class OrganisationEfrisConfig(TimestampedBase):
    __tablename__ = "organisation_efris_configs"

    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organisations.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    # URA environment: 'mock' | 'uat' | 'prod'
    environment: Mapped[str] = mapped_column(String(16), nullable=False, default="mock")

    # Base URL for the EFRIS API
    api_url: Mapped[str] = mapped_column(String(512), nullable=False, default="")

    # URA Tax Identification Number
    tin: Mapped[str] = mapped_column(String(64), nullable=False, default="")

    # Registered fiscal device serial number
    device_no: Mapped[str] = mapped_column(String(64), nullable=False, default="")

    # API credentials
    username: Mapped[str] = mapped_column(String(128), nullable=False, default="")

    # Fernet-encrypted API password — NEVER exposed via API
    password_encrypted: Mapped[str] = mapped_column(Text, nullable=False, default="")

    # Taxpayer ID returned by T103 login; stored for subsequent encrypted requests
    taxpayer_id: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # QR code verification URL prefix returned by T103 login
    qr_code_url: Mapped[str | None] = mapped_column(String(512), nullable=True)

    # Master on/off switch; false until org explicitly enables
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Audit: who last touched this config
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )

    def __repr__(self) -> str:
        return f"<OrganisationEfrisConfig org={self.organisation_id} env={self.environment} active={self.is_active}>"


class EfrisAuditLog(Base):
    """Append-only audit trail for every EFRIS API interaction.

    No updated_at — rows are never modified after insert.
    Passwords and tokens are scrubbed from request_payload before storage.
    """
    __tablename__ = "efris_audit_log"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )

    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organisations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    payment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("payments.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # T101 | T103 | T109 | retry
    action: Mapped[str] = mapped_column(String(64), nullable=False)

    # Scrubbed request payload (password/token fields removed before insert)
    request_payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Full URA response payload
    response_payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # HTTP status code
    status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # success | failed | error | skipped
    efris_status: Mapped[str] = mapped_column(String(32), nullable=False, default="unknown")

    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Round-trip latency in milliseconds
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return (
            f"<EfrisAuditLog action={self.action} status={self.efris_status} "
            f"payment={self.payment_id}>"
        )
