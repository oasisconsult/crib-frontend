"""
039 — GeoBox Smart Addressing settings

Adds four system_settings rows that configure the GeoBox integration:
  geobox.environment       — 'sandbox' or 'production' (controls which credential pair is active)
  geobox.client_id         — GeoBox developer app client ID (not secret)
  geobox.client_secret     — GeoBox developer app client secret (Fernet-encrypted at rest)
  geobox.geocoding_enabled — feature flag; set to 'false' to disable all GeoBox calls

Revision ID: 039
Revises: 038
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "039"
down_revision = "038"
branch_labels = None
depends_on = None

_ROWS = [
    {
        "key": "geobox.environment",
        "value": "sandbox",
        "category": "geobox",
        "label": "GeoBox Environment",
        "description": (
            "Active GeoBox environment: 'sandbox' (testing) or 'production'. "
            "Controls which credential pair is used for all API calls."
        ),
        "value_type": "string",
        "is_secret": False,
        "is_required": True,
    },
    {
        "key": "geobox.client_id",
        "value": "",
        "category": "geobox",
        "label": "GeoBox App Client ID",
        "description": (
            "Client ID issued when you create the Crib app in the GeoBox developer portal. "
            "Not a secret — safe to display in the admin UI."
        ),
        "value_type": "string",
        "is_secret": False,
        "is_required": False,
    },
    {
        "key": "geobox.client_secret",
        "value": "",
        "category": "geobox",
        "label": "GeoBox App Client Secret",
        "description": (
            "Client secret issued once when you create or rotate app credentials in the "
            "GeoBox developer portal. Stored encrypted; never re-displayed after save."
        ),
        "value_type": "string",
        "is_secret": True,
        "is_required": False,
    },
    {
        "key": "geobox.geocoding_enabled",
        "value": "true",
        "category": "geobox",
        "label": "GeoBox Geocoding Enabled",
        "description": (
            "Master switch for GeoBox features. Set to 'false' to disable all geocode "
            "lookups and village-search calls without removing credentials."
        ),
        "value_type": "boolean",
        "is_secret": False,
        "is_required": True,
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
