"""030 — Caretaker invites + profile scoping fields

Revision ID: 030
Revises: 029
Create Date: 2026-05-21

Creates:
  - caretaker_invites  : owner invites a caretaker for delegated property access
  - profiles additions : caretaker_owner_profile_id, caretaker_permission_level,
                         caretaker_property_ids
  - roles seed         : insert "caretaker" role (priority 15 — between owner and manager)
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "030"
down_revision: str | None = "029"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── caretaker_invites ─────────────────────────────────────────────────────
    op.create_table(
        "caretaker_invites",
        sa.Column("id", UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        # The owner/landlord who sent the invite
        sa.Column("owner_profile_id", UUID(as_uuid=True),
                  sa.ForeignKey("profiles.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        # Caretaker personal details
        sa.Column("email",      sa.String(255), nullable=False),
        sa.Column("first_name", sa.String(100), nullable=False),
        sa.Column("last_name",  sa.String(100), nullable=False),
        sa.Column("phone",      sa.String(50),  nullable=True),
        # JSONB array of property UUIDs to delegate
        sa.Column("property_ids", JSONB, nullable=False,
                  server_default=sa.text("'[]'::jsonb")),
        # "full" or "operations_only"
        sa.Column("permission_level", sa.String(30), nullable=False,
                  server_default="full"),
        # Invite lifecycle
        sa.Column("token",       sa.String(64), nullable=False, unique=True, index=True),
        sa.Column("status",      sa.String(20), nullable=False, server_default="pending"),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at",  sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at",  sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at",  sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
    )

    # ── profiles: caretaker delegation fields ─────────────────────────────────
    op.add_column("profiles",
        sa.Column("caretaker_owner_profile_id", UUID(as_uuid=True),
                  sa.ForeignKey("profiles.id", ondelete="SET NULL"),
                  nullable=True, index=True))
    op.add_column("profiles",
        sa.Column("caretaker_permission_level", sa.String(30), nullable=True))
    op.add_column("profiles",
        sa.Column("caretaker_property_ids", JSONB, nullable=True))

    # ── roles table: add "caretaker" ──────────────────────────────────────────
    # Priority 15 = between owner(10) and manager(20).
    # Caretakers inherit owner-level dashboard access but our API scopes them
    # to only the property_ids the owner delegated.
    op.execute(sa.text("""
        INSERT INTO roles (name, description, priority)
        VALUES (
            'caretaker',
            'Delegated property manager. Same operational access as owner '
            'but restricted to the specific properties the owner assigned.',
            15
        )
        ON CONFLICT (name) DO NOTHING
    """))


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM roles WHERE name = 'caretaker'"))
    op.drop_column("profiles", "caretaker_property_ids")
    op.drop_column("profiles", "caretaker_permission_level")
    op.drop_column("profiles", "caretaker_owner_profile_id")
    op.drop_table("caretaker_invites")
