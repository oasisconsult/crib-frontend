"""
018 – Lease notice_vacate_date column

Adds:
  leases.notice_vacate_date   DATE (nullable)

This stores the tenant's intended move-out date when they submit a
notice-to-vacate via the tenant portal.
"""

from alembic import op
import sqlalchemy as sa

revision = "018"
down_revision = "017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "leases",
        sa.Column("notice_vacate_date", sa.Date(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("leases", "notice_vacate_date")
