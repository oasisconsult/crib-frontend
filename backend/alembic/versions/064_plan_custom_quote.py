"""subscription_plans — add requires_custom_quote flag.

Revision ID: 064
Revises: 063
Create Date: 2026-06-19

Adds:
  subscription_plans.requires_custom_quote  — if True the plan cannot be
  purchased through the self-serve payment flow; the user must contact sales.
  Defaults to False for all existing plans. Set to True for enterprise.
"""
import sqlalchemy as sa
from alembic import op

revision = "064"
down_revision = "063"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "subscription_plans",
        sa.Column(
            "requires_custom_quote",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )
    op.execute(
        "UPDATE subscription_plans SET requires_custom_quote = TRUE WHERE slug = 'enterprise'"
    )


def downgrade() -> None:
    op.drop_column("subscription_plans", "requires_custom_quote")
