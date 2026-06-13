"""Backfill inspection lease_id from active lease for unit

Revision ID: 052
Revises: 051
Create Date: 2026-06-13
"""

from alembic import op

revision = "052"
down_revision = "051"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        UPDATE inspections i
        SET lease_id = l.id
        FROM leases l
        WHERE i.unit_id IS NOT NULL
          AND i.lease_id IS NULL
          AND l.unit_id = i.unit_id
          AND l.status = 'active'
    """)


def downgrade() -> None:
    pass  # backfill is safe to leave in place
