"""
046 — Soft-delete support for rent_schedules

Adds a nullable deleted_at (timestamptz) column to rent_schedules so that
individual schedule rows can be soft-deleted (e.g. when a lease is corrected
or a duplicate period removed) without losing the audit trail.

Queries that list schedules filter deleted_at IS NULL; deleted rows are
excluded from all tenant-facing and reporting views.

Revision ID: 046
Revises: 045
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "046"
down_revision = "045"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "rent_schedules",
        sa.Column(
            "deleted_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_rent_schedules_deleted_at",
        "rent_schedules",
        ["deleted_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_rent_schedules_deleted_at", table_name="rent_schedules")
    op.drop_column("rent_schedules", "deleted_at")
