"""042 — normalize late_fee_type 'percent' → 'percentage'

Revision ID: 042
Revises: 041
Create Date: 2026-06-10

The frontend has always used "percentage" as the canonical value but the
LeaseBillingTab admin form was saving "percent", causing the backend
calculation to misidentify percentage-type fees as flat fees.

This migration normalises all existing "percent" rows to "percentage" in
both the leases table (late_fee_type column) and the late_fees table
(fee_type column), so the DB is consistent with the TypeScript types.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "042"
down_revision = "041"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        sa.text("UPDATE leases SET late_fee_type = 'percentage' WHERE late_fee_type = 'percent'")
    )
    op.execute(
        sa.text("UPDATE late_fees SET fee_type = 'percentage' WHERE fee_type = 'percent'")
    )


def downgrade() -> None:
    op.execute(
        sa.text("UPDATE leases SET late_fee_type = 'percent' WHERE late_fee_type = 'percentage'")
    )
    op.execute(
        sa.text("UPDATE late_fees SET fee_type = 'percent' WHERE fee_type = 'percentage'")
    )
