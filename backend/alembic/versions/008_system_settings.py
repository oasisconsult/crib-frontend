"""Add system_settings table and superadmin role

Revision ID: 008
Revises: 007
Create Date: 2026-03-30
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from app.models.system_setting import SYSTEM_SETTING_DEFAULTS

revision: str = "008"
down_revision: str | None = "007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── Add superadmin to role_enum ───────────────────────────────────────────
    op.execute(
        "ALTER TYPE role_enum ADD VALUE IF NOT EXISTS 'superadmin' BEFORE 'owner'"
    )

    # ── Create system_settings table ──────────────────────────────────────────
    op.create_table(
        "system_settings",
        sa.Column("key",         sa.String(120),                              primary_key=True),
        sa.Column("value",       sa.Text,          nullable=False, default=""),
        sa.Column("category",    sa.String(30),    nullable=False),
        sa.Column("label",       sa.String(255),   nullable=False),
        sa.Column("description", sa.Text,          nullable=False, default=""),
        sa.Column("value_type",  sa.String(20),    nullable=False, default="string"),
        sa.Column("is_secret",   sa.Boolean,       nullable=False, default=False),
        sa.Column("is_required", sa.Boolean,       nullable=False, default=False),
        sa.Column("updated_by",  sa.String(100),   nullable=True),
        sa.Column("updated_at",  sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
        sa.Column("created_at",  sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
    )

    op.create_index("ix_system_settings_category", "system_settings", ["category"])

    # ── Seed default rows ─────────────────────────────────────────────────────
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
            "key": key, "value": value, "category": category,
            "label": label, "description": description,
            "value_type": value_type, "is_secret": is_secret,
            "is_required": is_required,
        }
        for key, value, category, label, description, value_type, is_secret, is_required
        in SYSTEM_SETTING_DEFAULTS
    ])


def downgrade() -> None:
    op.drop_index("ix_system_settings_category", table_name="system_settings")
    op.drop_table("system_settings")
    # Note: PostgreSQL does not support removing enum values without recreating the type.
    # The superadmin value is left in role_enum on downgrade.
