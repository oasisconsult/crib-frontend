"""026 — Add is_independent to landlord_invites

Revision ID: 026
Revises: 025
Create Date: 2026-05-16

Distinguishes between two landlord types:
  is_independent = False (default) — agency-managed landlord, scoped to
    the inviting agency's organisation, read-only view via LandlordPropertyAccess.
  is_independent = True — self-managing landlord, gets a personal organisation
    created at onboarding time, acts as 'owner' of their own org.

Default FALSE ensures all existing invites are treated as agency-managed
and no behaviour changes for the current codebase.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "026"
down_revision: str | None = "025"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "landlord_invites",
        sa.Column(
            "is_independent",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("landlord_invites", "is_independent")
