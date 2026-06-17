"""
TenancyAgreement model.

Stores the rendered HTML of the full tenancy agreement and tracks
dual-signature state:
  - tenant signs during the onboarding wizard (POST /onboarding/{token}/sign)
  - landlord/manager countersigns via dashboard or email link
    (POST /leases/{id}/agreement/countersign)

Status lifecycle:
  draft → tenant_signed → fully_executed

A TenancyAgreement is created when the tenant signs.
The record reaches fully_executed once the landlord countersigns.
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TimestampedBase


class TenancyAgreementStatus(str, enum.Enum):
    draft         = "draft"
    tenant_signed = "tenant_signed"
    fully_executed = "fully_executed"


class TenancyAgreement(TimestampedBase):
    __tablename__ = "tenancy_agreements"

    lease_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("leases.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    # The full rendered HTML of the agreement at signing time
    rendered_html: Mapped[str] = mapped_column(Text, nullable=False)

    status: Mapped[TenancyAgreementStatus] = mapped_column(
        Enum(TenancyAgreementStatus, name="tenancy_agreement_status_enum"),
        nullable=False,
        default=TenancyAgreementStatus.draft,
    )

    # ── Tenant signature ───────────────────────────────────────────────────────
    tenant_signature_data_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    tenant_signed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    tenant_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)

    # ── Landlord / manager countersignature ───────────────────────────────────
    landlord_signature_data_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    landlord_signed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    landlord_signer_id: Mapped[str | None] = mapped_column(
        String(100), nullable=True  # Logto user ID of the manager who countersigned
    )
    landlord_signer_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # ── Cryptographic signing evidence (migration 059) ────────────────────────
    # SHA-256 hex of rendered_html at the moment of tenant signing.
    # Any post-signing edit to rendered_html produces a different hash → tamper evident.
    document_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Append-only audit log: [{event, actor, email, ip, user_agent, otp_verified,
    #                          session_authenticated, document_hash, timestamp}]
    signing_events: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    # S3/MinIO URL of the sealed certificate PDF (set after fully_executed).
    sealed_pdf_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<TenancyAgreement lease={self.lease_id} status={self.status}>"
