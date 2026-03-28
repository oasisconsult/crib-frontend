"""
Profile model — lightweight bridge between Logto users and our domain.

Each Logto user who has accessed the system has exactly one Profile row.
The Profile carries only domain-level context that Logto doesn't manage:
  - which tenant they are linked to (nullable — only set for role=tenant)
  - GDPR consent state
  - phone number (for SMS/WhatsApp notifications)
  - display name + email cached from the JWT (for notifications without Logto API calls)

The Profile is upserted on first authenticated request.
"""

import enum
import uuid

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import TimestampedBase


class Role(str, enum.Enum):
    owner = "owner"        # Organisation owner / landlord (full access)
    manager = "manager"    # Property manager (org-scoped admin)
    tenant = "tenant"      # Tenant (restricted to their own data)
    maintenance = "maintenance"  # Maintenance staff (read-only inspections)


class Profile(TimestampedBase):
    __tablename__ = "profiles"

    # ── Logto identity ────────────────────────────────────────────────────────
    logto_sub: Mapped[str] = mapped_column(
        String(100), unique=True, nullable=False, index=True,
        comment="Logto user sub (JWT `sub` claim)"
    )
    logto_org_id: Mapped[str | None] = mapped_column(
        String(100), nullable=True, index=True,
        comment="Logto org ID (JWT `organization_id` claim)"
    )

    # ── Organisation FK ───────────────────────────────────────────────────────
    organisation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organisations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # ── Role ──────────────────────────────────────────────────────────────────
    role: Mapped[Role] = mapped_column(
        Enum(Role, name="role_enum"), nullable=False, default=Role.tenant
    )

    # ── Cached identity fields (synced from JWT / Logto webhook) ─────────────
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)

    # ── Tenant FK (set only when role=tenant) ────────────────────────────────
    # Circular import avoided: tenant_id is a raw FK without a back-reference here.
    # The Tenant model carries its own relationship back to Profile.
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # ── GDPR ─────────────────────────────────────────────────────────────────
    gdpr_consent_given: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    gdpr_consent_at: Mapped[DateTime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    anonymised_at: Mapped[DateTime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # ── Activity ─────────────────────────────────────────────────────────────
    last_seen_at: Mapped[DateTime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    def __repr__(self) -> str:
        return f"<Profile {self.logto_sub!r} role={self.role}>"
