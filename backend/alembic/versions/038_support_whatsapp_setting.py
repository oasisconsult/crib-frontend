"""
038 — Support WhatsApp setting

Adds `platform.support_whatsapp` (default "") alongside the existing
`platform.support_email` / `platform.support_phone` — the superadmin-
configurable WhatsApp contact number shown on the public marketing site
footer's "WhatsApp Us" link, so the whole public contact block can be
managed from one place without a code change or deploy.

Revision ID: 038
Revises: 037
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "038"
down_revision = "037"
branch_labels = None
depends_on = None

_KEY = "platform.support_whatsapp"


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
            category="platform",
            label="Support WhatsApp Number",
            description=(
                "WhatsApp contact number shown on the public site's 'WhatsApp Us' "
                "link, in international format without '+' or spaces "
                "(e.g. 256700000000). Leave empty to hide the link."
            ),
            value_type="string",
            is_secret=False,
            is_required=False,
        )
    )


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM system_settings WHERE key = :key").bindparams(key=_KEY))
