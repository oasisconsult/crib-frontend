"""023 — Agency invites (superadmin → new agency onboarding)

Revision ID: 023
Revises: 022
Create Date: 2026-04-20

Creates:
  - agency_invites : superadmin sends invite → agency fills onboarding form →
                     Logto org + manager user created
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "023"
down_revision: str | None = "022"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "agency_invites",
        sa.Column("id", UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("invited_by_profile_id", UUID(as_uuid=True),
                  sa.ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True),
        # Pre-filled by superadmin; editable during onboarding
        sa.Column("agency_name",         sa.String(255), nullable=False),
        sa.Column("manager_email",       sa.String(255), nullable=False),
        sa.Column("manager_first_name",  sa.String(100), nullable=False),
        sa.Column("manager_last_name",   sa.String(100), nullable=False),
        # Filled when the agency completes onboarding
        sa.Column("agency_phone",        sa.String(50),  nullable=True),
        sa.Column("agency_contact_email",sa.String(255), nullable=True),
        sa.Column("agency_country",      sa.String(2),   nullable=True),
        sa.Column("agency_currency",     sa.String(3),   nullable=True),
        sa.Column("agency_address",      sa.Text,        nullable=True),
        # Link to created org (set on acceptance)
        sa.Column("organisation_id", UUID(as_uuid=True),
                  sa.ForeignKey("organisations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("token",  sa.String(64), nullable=False, unique=True, index=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at",  sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at",  sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at",  sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("agency_invites")
