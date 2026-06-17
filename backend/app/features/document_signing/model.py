"""SigningOtp — email OTP records for document signing verification."""

from __future__ import annotations

import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class SigningOtp(Base):
    """
    One-time code sent to a signer's email to verify identity before signing.

    Lifecycle:
      created → (email sent) → used_at set on successful verify
      Expired if now() > expires_at and used_at is None.

    purpose values: "tenant_sign" | "countersign"
    """

    __tablename__ = "signing_otps"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=sa.text("gen_random_uuid()"),
    )
    lease_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("leases.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    # SHA-256 hex of the raw 6-digit code string
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    # "tenant_sign" or "countersign"
    purpose: Mapped[str] = mapped_column(String(50), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=sa.text("now()"),
    )

    def __repr__(self) -> str:
        return f"<SigningOtp lease={self.lease_id} purpose={self.purpose} used={self.used_at is not None}>"
