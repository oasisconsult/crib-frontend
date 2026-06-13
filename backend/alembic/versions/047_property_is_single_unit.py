"""Add is_single_unit to properties

Revision ID: 047
Revises: 046
Create Date: 2026-06-12
"""

from alembic import op
import sqlalchemy as sa

revision = "047"
down_revision = "046"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "properties",
        sa.Column("is_single_unit", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("properties", "is_single_unit")
