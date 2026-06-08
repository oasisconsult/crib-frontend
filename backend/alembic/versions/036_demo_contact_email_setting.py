"""
036 — Demo contact email setting

Adds `notifications.demo_contact_email` (default "demo@geoboxafrica.com") —
the superadmin-configurable email shown to visitors on the public 'Book a
Demo' widget when they have questions before their session. Distinct from
`notifications.demo_booking_email`, which is the internal address that
receives new-booking alerts.

Revision ID: 036
Revises: 035
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "036"
down_revision = "035"
branch_labels = None
depends_on = None

_KEY = "notifications.demo_contact_email"


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
            "value": "demo@geoboxafrica.com",
            "category": "platform",
            "label": "Demo Contact Email",
            "description": (
                "Email shown to visitors on the 'Book a Demo' page if they have "
                "questions before their session. Displayed as a click-to-email "
                "link, never as plain text, to discourage scraping."
            ),
            "value_type": "string",
            "is_secret": False,
            "is_required": False,
        },
    ])


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM system_settings WHERE key = :key").bindparams(key=_KEY))
