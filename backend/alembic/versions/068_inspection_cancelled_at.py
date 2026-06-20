"""add cancelled_at to inspections

Revision ID: 068
Revises: 067
Create Date: 2026-06-20

"""
from alembic import op
import sqlalchemy as sa

revision = "068"
down_revision = "067"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "inspections",
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("inspections", "cancelled_at")
