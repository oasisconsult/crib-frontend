"""
Profile model — lightweight bridge between Logto users and our domain.

Each Logto user who has accessed the system has exactly one Profile row.
The Profile carries only domain-level context that Logto doesn't manage:
  - which tenant they are linked to (nullable — only set for role=tenant)
  - GDPR consent state
  - phone number (for SMS/WhatsApp notifications)
  - display name + email cached from the JWT (for notifications without Logto API calls)

The Profile is upserted on first authenticated request.

Role design:
  `role` is stored as a plain VARCHAR(50) string — it is the *primary* role name
  for display/notification purposes, re-synced from the JWT on every request.
  The authoritative list of valid roles lives in the `roles` DB table (see rbac.py).
  Use `deps.CurrentUser.roles` (list[str]) for all authorisation decisions.

  Phase 4 (DB-authoritative): `deps.get_current_user` prefers roles resolved by
  `AppContextMiddleware` via `request.state.rbac.roles` (geobox-rbac RBAC DB) and
  falls back to JWT claims when the middleware is absent (e.g. RBAC_DATABASE_URL
  not configured).  No additional column is needed on this model.
"""

import uuid

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TimestampedBase


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
    # Plain string — re-synced from JWT on every request. See module docstring.
    role: Mapped[str] = mapped_column(
        String(50), nullable=False, default="tenant", server_default="tenant"
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

    # ── Landlord flag ────────────────────────────────────────────────────────
    # True for agency-managed landlords (view-only access to their properties).
    # False for self-managing landlords (full CRUD via their own org).
    is_read_only: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # ── GDPR ─────────────────────────────────────────────────────────────────
    gdpr_consent_given: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    gdpr_consent_at: Mapped[DateTime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    anonymised_at: Mapped[DateTime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # ── Soft-delete ───────────────────────────────────────────────────────────
    # NULL = active. Non-NULL = deactivated; profile hidden from normal queries.
    # LandlordPropertyAccess rows are kept so access is restored on un-delete.
    deleted_at: Mapped[DateTime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )

    # ── Activity ─────────────────────────────────────────────────────────────
    last_seen_at: Mapped[DateTime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # ── Caretaker delegation ──────────────────────────────────────────────────
    # Set only when role="caretaker".  NULL on all other profiles.
    #
    # caretaker_owner_profile_id — the owner who delegated access
    # caretaker_permission_level — "full" | "operations_only"
    # caretaker_property_ids     — JSONB list[str] of property UUIDs this
    #                              caretaker may access; enforced at the API
    #                              layer on every query.
    caretaker_owner_profile_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    caretaker_permission_level: Mapped[str | None] = mapped_column(
        String(30), nullable=True
    )
    caretaker_property_ids: Mapped[list | None] = mapped_column(
        JSONB, nullable=True
    )

    def __repr__(self) -> str:
        return f"<Profile {self.logto_sub!r} role={self.role}>"
