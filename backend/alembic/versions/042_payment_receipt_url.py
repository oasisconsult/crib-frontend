"""Add receipt_url to payments

Revision ID: 042
Revises: 041
Create Date: 2026-06-11
"""
from alembic import op
import sqlalchemy as sa

revision = "042"
down_revision = "041"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("payments", sa.Column("receipt_url", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("payments", "receipt_url")
