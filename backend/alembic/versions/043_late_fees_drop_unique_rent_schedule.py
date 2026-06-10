"""043 — drop unique constraint on late_fees.rent_schedule_id

Revision ID: 043
Revises: 042
Create Date: 2026-06-10

The daily late fee accrual task creates one LateFee row per chargeable day.
The existing UNIQUE constraint on rent_schedule_id only allowed one row per
schedule, blocking multi-day accrual. Drop the constraint so multiple daily
records can exist for the same schedule.
"""
from __future__ import annotations

from alembic import op

revision = "043"
down_revision = "042"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("late_fees_rent_schedule_id_key", "late_fees", type_="unique")


def downgrade() -> None:
    op.create_unique_constraint("late_fees_rent_schedule_id_key", "late_fees", ["rent_schedule_id"])
