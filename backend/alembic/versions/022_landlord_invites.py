"""022 — Landlord invites, property access, and profile read-only flag

Revision ID: 022
Revises: 021
Create Date: 2026-04-20

Creates:
  - landlord_invites       : manager/superadmin → individual landlord invite
  - landlord_property_access : which properties a landlord can view
Adds:
  - profiles.is_read_only  : True for agency-managed landlords
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision: str = "022"
down_revision: str | None = "021"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── landlord_invites ──────────────────────────────────────────────────────
    op.create_table(
        "landlord_invites",
        sa.Column("id", UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("organisation_id", UUID(as_uuid=True),
                  sa.ForeignKey("organisations.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("invited_by_profile_id", UUID(as_uuid=True),
                  sa.ForeignKey("profiles.id", ondelete="SET NULL"),
                  nullable=True),
        sa.Column("email",      sa.String(255), nullable=False),
        sa.Column("first_name", sa.String(100), nullable=False),
        sa.Column("last_name",  sa.String(100), nullable=False),
        sa.Column("phone",      sa.String(50),  nullable=True),
        # UUIDs of properties this landlord should see
        sa.Column("property_ids", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("message",    sa.Text,        nullable=True),
        sa.Column("token",      sa.String(64),  nullable=False, unique=True, index=True),
        sa.Column("status",     sa.String(20),  nullable=False, server_default="pending"),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at",  sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at",  sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at",  sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
    )

    # ── landlord_property_access ──────────────────────────────────────────────
    op.create_table(
        "landlord_property_access",
        sa.Column("id", UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("landlord_profile_id", UUID(as_uuid=True),
                  sa.ForeignKey("profiles.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("property_id", UUID(as_uuid=True),
                  sa.ForeignKey("properties.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("is_read_only", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("granted_by_profile_id", UUID(as_uuid=True),
                  sa.ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True),
        sa.Column("granted_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("landlord_profile_id", "property_id",
                            name="uq_landlord_property_access"),
    )

    # ── profiles.is_read_only ────────────────────────────────────────────────
    op.add_column(
        "profiles",
        sa.Column("is_read_only", sa.Boolean, nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("profiles", "is_read_only")
    op.drop_table("landlord_property_access")
    op.drop_table("landlord_invites")
