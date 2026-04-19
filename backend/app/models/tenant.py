"""
Tenant, TenantDocument, and TenantInvite models.

Tenant is the core domain entity — a person renting a unit.
It expands the stub table created in migration 001.

TenantDocument holds metadata for files stored in MinIO.
TenantInvite holds the one-time onboarding token sent to a prospective tenant.
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import TimestampedBase


class TenantStatus(str, enum.Enum):
    active = "active"
    inactive = "inactive"
    blacklisted = "blacklisted"


class OnboardingState(str, enum.Enum):
    invited = "invited"
    started = "started"
    submitted = "submitted"
    approved = "approved"
    activated = "activated"
    rejected = "rejected"


class IdDocumentType(str, enum.Enum):
    passport = "passport"
    national_id = "national_id"
    driving_licence = "driving_licence"
    residence_permit = "residence_permit"
    proof_of_income = "proof_of_income"
    reference_letter = "reference_letter"
    bank_statement = "bank_statement"
    other = "other"


class InviteStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    expired = "expired"


# ── Tenant ─────────────────────────────────────────────────────────────────────

class Tenant(TimestampedBase):
    __tablename__ = "tenants"

    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organisations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    reference: Mapped[str | None] = mapped_column(String(40), nullable=True, unique=True, index=True)

    # Logto user link (set once the tenant creates a Logto account)
    logto_user_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)

    # ── Personal details ───────────────────────────────────────────────────────
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    date_of_birth: Mapped[str | None] = mapped_column(String(20), nullable=True)
    nationality: Mapped[str | None] = mapped_column(String(100), nullable=True)
    nin: Mapped[str | None] = mapped_column(String(50), nullable=True)  # National ID Number

    # ── Status + onboarding ───────────────────────────────────────────────────
    status: Mapped[TenantStatus] = mapped_column(
        Enum(TenantStatus, name="tenant_status_enum"),
        nullable=False,
        default=TenantStatus.inactive,
    )
    onboarding_state: Mapped[OnboardingState] = mapped_column(
        Enum(OnboardingState, name="onboarding_state_enum"),
        nullable=False,
        default=OnboardingState.invited,
    )
    onboarding_token: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    onboarding_completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Current placement (cached FKs updated when lease activates) ───────────
    current_property_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("properties.id", ondelete="SET NULL"),
        nullable=True,
    )
    current_unit_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    current_lease_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )

    # ── Contact / payment details (captured during onboarding) ────────────────
    whatsapp_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    mobile_money_provider: Mapped[str | None] = mapped_column(String(20), nullable=True)  # mtn | airtel
    mobile_money_number: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # ── Additional info ───────────────────────────────────────────────────────
    emergency_contact: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    # ── Onboarding draft (partial progress saved server-side) ─────────────────
    # Stores { step, profile: {phone, dateOfBirth, nationality}, emergencyContact }
    # Cleared on successful submission. Used to restore wizard position when
    # a tenant returns via a resent invite link.
    onboarding_draft: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # ── GDPR ─────────────────────────────────────────────────────────────────
    gdpr_consent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    data_retention_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    anonymised_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    documents: Mapped[list["TenantDocument"]] = relationship(
        "TenantDocument", back_populates="tenant", cascade="all, delete-orphan"
    )
    invites: Mapped[list["TenantInvite"]] = relationship(
        "TenantInvite", back_populates="tenant", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Tenant {self.first_name} {self.last_name} state={self.onboarding_state}>"


# ── TenantDocument ─────────────────────────────────────────────────────────────

class TenantDocument(TimestampedBase):
    __tablename__ = "tenant_documents"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    type: Mapped[IdDocumentType] = mapped_column(
        Enum(IdDocumentType, name="id_document_type_enum"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    url: Mapped[str] = mapped_column(String(1024), nullable=False)  # MinIO presigned / object URL
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    tenant: Mapped[Tenant] = relationship("Tenant", back_populates="documents")

    def __repr__(self) -> str:
        return f"<TenantDocument {self.type} verified={self.verified}>"


# ── TenantInvite ───────────────────────────────────────────────────────────────

class TenantInvite(TimestampedBase):
    __tablename__ = "tenant_invites"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organisations.id", ondelete="CASCADE"),
        nullable=False,
    )
    property_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("properties.id", ondelete="SET NULL"),
        nullable=True,
    )
    unit_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    # Explicit lease linked at invite creation — drives the onboarding payment flow
    lease_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("leases.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    email: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    token: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    status: Mapped[InviteStatus] = mapped_column(
        Enum(InviteStatus, name="invite_status_enum"),
        nullable=False,
        default=InviteStatus.pending,
    )
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    tenant: Mapped[Tenant] = relationship("Tenant", back_populates="invites")

    def __repr__(self) -> str:
        return f"<TenantInvite {self.email} status={self.status}>"
