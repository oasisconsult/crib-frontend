"""025 — Soft-delete columns

Revision ID: 025
Revises: 024
Create Date: 2026-05-16

Adds deleted_at (nullable DateTime) to profiles, organisations, properties,
and units so each can be soft-deleted without destroying audit / financial history.

Industry standard pattern:
  NULL    → record is active
  non-NULL → record is soft-deleted (hidden from normal queries)

Organisations already have is_active (boolean); deleted_at complements it by
recording exactly when the archive happened and enabling time-based retention.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "025"
down_revision: str | None = "024"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    for table in ("profiles", "organisations", "properties", "units"):
        op.add_column(
            table,
            sa.Column(
                "deleted_at",
                sa.DateTime(timezone=True),
                nullable=True,
                server_default=None,
            ),
        )
        op.create_index(
            f"ix_{table}_deleted_at",
            table,
            ["deleted_at"],
        )


def downgrade() -> None:
    for table in ("profiles", "organisations", "properties", "units"):
        op.drop_index(f"ix_{table}_deleted_at", table_name=table)
        op.drop_column(table, "deleted_at")
