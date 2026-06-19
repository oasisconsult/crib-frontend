"""Add inspection_reports and screenings platform feature flags.

Revision ID: 066
Revises: 065
Create Date: 2026-06-19
"""
from alembic import op

revision = "066"
down_revision = "065"
branch_labels = None
depends_on = None

_NEW_FLAGS = [
    (
        "features.inspection_reports",
        "true",
        "features",
        "Inspection Reports",
        "Enable the property inspection report flow including PDF generation, dual-party signing, "
        "and the inspector invite portal. When disabled, inspection creation is blocked platform-wide.",
        "boolean",
        False,
        True,
    ),
    (
        "features.screenings",
        "false",
        "features",
        "Tenant Screening",
        "Enable the tenant screening / background-check workflow. "
        "Disabled by default until the screening integration is fully configured.",
        "boolean",
        False,
        True,
    ),
]


def upgrade() -> None:
    for key, value, category, label, description, value_type, is_secret, is_required in _NEW_FLAGS:
        op.execute(
            f"""
            INSERT INTO system_settings
                (key, value, category, label, description, value_type, is_secret, is_required)
            VALUES
                ('{key}', '{value}', '{category}', '{label}',
                 '{description}', '{value_type}', {is_secret}, {is_required})
            ON CONFLICT (key) DO NOTHING
            """
        )


def downgrade() -> None:
    for key, *_ in _NEW_FLAGS:
        op.execute(f"DELETE FROM system_settings WHERE key = '{key}'")
