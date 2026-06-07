"""
034 — Recent tenancy threshold setting

Adds `payments.recent_tenancy_threshold_months` (default "3") — the system
setting that drives rent_ledger_engine's decision on whether a tenancy's
start_date is "recent" enough to trust as the schedule-generation anchor, or
whether to fall back to the "rent assumed settled up to system entry date"
baseline for older/migrated tenancies.

Revision ID: 034
Revises: 033
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "034"
down_revision = "033"
branch_labels = None
depends_on = None

_KEY = "payments.recent_tenancy_threshold_months"


def upgrade() -> None:
    table = sa.table(
        "system_settings",
        sa.column("key"),
        sa.column("value"),
        sa.column("category"),
        sa.column("label"),
        sa.column("description"),
        sa.column("value_type"),
        sa.column("is_secret"),
        sa.column("is_required"),
    )
    op.bulk_insert(table, [
        {
            "key": _KEY,
            "value": "3",
            "category": "payments",
            "label": "Recent Tenancy Threshold (months)",
            "description": (
                "How many months may pass between a tenancy's start date and the date "
                "it was entered into Crib before it's treated as an older/migrated "
                "tenancy. Tenancies within this window are scheduled from their real "
                "start date; older ones are anchored to the date they were entered, "
                "with rent assumed settled up to then."
            ),
            "value_type": "integer",
            "is_secret": False,
            "is_required": True,
        },
    ])


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM system_settings WHERE key = :key").bindparams(key=_KEY))
