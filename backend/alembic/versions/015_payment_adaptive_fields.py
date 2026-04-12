"""
015 – Adaptive payment fields

Adds four columns to the payments table to support intelligent, cost-aware
routing and failure prediction (Payment Skill v3/v4):

  failure_reason          TEXT       — populated when a payment fails (mobile money, etc.)
  retry_count             INTEGER    — incremented on each retry attempt (default 0)
  predicted_failure_score FLOAT      — heuristic score 0–1 (higher = more likely to fail)
  recommended_channel     VARCHAR(50)— channel suggested by adaptive routing engine
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("payments", sa.Column("failure_reason", sa.Text(), nullable=True))
    op.add_column("payments", sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("payments", sa.Column("predicted_failure_score", sa.Float(), nullable=True))
    op.add_column("payments", sa.Column("recommended_channel", sa.String(50), nullable=True))


def downgrade() -> None:
    op.drop_column("payments", "recommended_channel")
    op.drop_column("payments", "predicted_failure_score")
    op.drop_column("payments", "retry_count")
    op.drop_column("payments", "failure_reason")
