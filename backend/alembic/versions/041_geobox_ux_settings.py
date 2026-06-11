"""
041 — GeoBox UX settings for geocode field

Adds three system_settings rows used by the property form geocode UI:
  geobox.portal_url                — web destination for "Get a GeoBox code" on desktop
  geobox.whatsapp_create_message   — WhatsApp pre-fill message on mobile
  geobox.hierarchy_not_found_message — shown when a geocode resolves but has no hierarchy

All three are non-secret strings editable by superadmins via the Integrations
settings page. They appear in the GeoBox card automatically (the card renders
all geobox.* rows).

Revision ID: 041
Revises: 040
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "041"
down_revision = "040"
branch_labels = None
depends_on = None

_ROWS = [
    {
        "key": "geobox.portal_url",
        "value": "https://app.geoboxafrica.com",
        "category": "geobox",
        "label": "GeoBox Portal URL",
        "description": (
            "URL of the GeoBox web portal. Shown to landlords on desktop when they "
            "click 'Get a GeoBox code' on the property address form."
        ),
        "value_type": "string",
        "is_secret": False,
        "is_required": False,
    },
    {
        "key": "geobox.whatsapp_create_message",
        "value": "Hi, I want to create a GeoBox location code for my property",
        "category": "geobox",
        "label": "GeoBox Create-Code WhatsApp Message",
        "description": (
            "Pre-filled message sent to the GeoBox WhatsApp bot when a landlord taps "
            "'Get a GeoBox code' on a mobile device."
        ),
        "value_type": "string",
        "is_secret": False,
        "is_required": False,
    },
    {
        "key": "geobox.hierarchy_not_found_message",
        "value": (
            "Code found but address hierarchy is unavailable — "
            "please fill in the fields below manually."
        ),
        "category": "geobox",
        "label": "GeoBox Hierarchy Not Found Message",
        "description": (
            "Shown on the property form when a geocode resolves successfully but "
            "GeoBox returns no address hierarchy (district / county / village) data."
        ),
        "value_type": "string",
        "is_secret": False,
        "is_required": False,
    },
]


def upgrade() -> None:
    for row in _ROWS:
        op.execute(
            sa.text(
                "INSERT INTO system_settings"
                " (key, value, category, label, description, value_type, is_secret, is_required)"
                " VALUES (:key, :value, :category, :label, :description, :value_type, :is_secret, :is_required)"
                " ON CONFLICT (key) DO NOTHING"
            ).bindparams(**row)
        )


def downgrade() -> None:
    keys = [r["key"] for r in _ROWS]
    op.execute(
        sa.text("DELETE FROM system_settings WHERE key = ANY(:keys)").bindparams(
            keys=keys
        )
    )
