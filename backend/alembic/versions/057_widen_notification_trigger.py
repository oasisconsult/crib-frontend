"""widen notification trigger columns from 30 to 64

Revision ID: 057
Revises: 056
Create Date: 2026-06-15
"""
from alembic import op
import sqlalchemy as sa

revision = "057"
down_revision = "056"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "notification_templates",
        "trigger",
        existing_type=sa.String(30),
        type_=sa.String(64),
        existing_nullable=False,
    )
    op.alter_column(
        "notifications",
        "trigger",
        existing_type=sa.String(30),
        type_=sa.String(64),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "notifications",
        "trigger",
        existing_type=sa.String(64),
        type_=sa.String(30),
        existing_nullable=False,
    )
    op.alter_column(
        "notification_templates",
        "trigger",
        existing_type=sa.String(64),
        type_=sa.String(30),
        existing_nullable=False,
    )
