"""
016 – Payment v4 state machine: extended enum values

Adds the v4 state machine states to payment_status_enum.

New values (additive only — Postgres never allows removing enum values):
  initiated, predicted, routed, reconciled, allocated, completed,
  predicted_failure, retry_scheduled, permanently_failed

Existing values are unchanged:
  pending, confirmed, failed, refunded

State machine (happy path):
  initiated → predicted → routed → pending → reconciled → allocated → completed

Failure paths:
  predicted → predicted_failure
  pending/routed → retry_scheduled → routed (retry)
  any → permanently_failed (max retries / unrecoverable)
"""

from __future__ import annotations

from alembic import op

revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None

_NEW_VALUES = [
    "initiated",
    "predicted",
    "routed",
    "reconciled",
    "allocated",
    "completed",
    "predicted_failure",
    "retry_scheduled",
    "permanently_failed",
]


def upgrade() -> None:
    # ALTER TYPE ... ADD VALUE is idempotent via IF NOT EXISTS (Postgres 9.6+)
    for val in _NEW_VALUES:
        op.execute(
            f"ALTER TYPE payment_status_enum ADD VALUE IF NOT EXISTS '{val}'"
        )


def downgrade() -> None:
    # PostgreSQL does not support removing enum values.
    # A full downgrade would require recreating the type and migrating all rows —
    # not safe to do automatically. Treat this as a no-op downgrade.
    pass
