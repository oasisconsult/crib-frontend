"""041 — geobox.whatsapp_number system setting

Revision ID: 041
Revises: 040
Create Date: 2026-06-10

Adds the geobox.whatsapp_number row to system_settings so the tenant portal
can fetch it via GET /settings/public and display a WhatsApp directions button
in the "How to Find Us" card.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "041"
down_revision = "040"
branch_labels = None
depends_on = None

_KEY = "geobox.whatsapp_number"


def upgrade() -> None:
    op.execute(
        sa.text(
            "INSERT INTO system_settings"
            " (key, value, category, label, description, value_type, is_secret, is_required)"
            " VALUES (:key, :value, :category, :label, :description, :value_type, :is_secret, :is_required)"
            " ON CONFLICT (key) DO NOTHING"
        ).bindparams(
            key=_KEY,
            value="",
            category="geobox",
            label="GeoBox Bot WhatsApp Number",
            description=(
                "The WhatsApp number tenants message to get directions via GeoBox. "
                "Include country code, e.g. +256700123456."
            ),
            value_type="string",
            is_secret=False,
            is_required=False,
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text("DELETE FROM system_settings WHERE key = :key").bindparams(key=_KEY)
    )
