"""
013 – Onboarding payment flow

Changes:
  1. Extend lease_status_enum with 6 onboarding states
  2. Add onboarding columns to leases table
  3. Add lease_id FK to tenant_invites
  4. Seed new system settings (payment auto-confirm, advance payment default)

Note: ALTER TYPE … ADD VALUE is non-transactional in PostgreSQL < 12.
      PostgreSQL 12+ allows it inside a transaction. We use IF NOT EXISTS
      so re-runs are safe.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. Extend lease_status_enum ───────────────────────────────────────────
    new_values = [
        "onboarding_started",
        "agreement_previewed",
        "terms_accepted",
        "payment_pending",
        "payment_secured",
        "agreement_signed",
    ]
    for val in new_values:
        op.execute(
            f"ALTER TYPE lease_status_enum ADD VALUE IF NOT EXISTS '{val}'"
        )

    # ── 2. New columns on leases ──────────────────────────────────────────────
    op.add_column("leases", sa.Column("terms_accepted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("leases", sa.Column("agreement_preview_snapshot", JSONB, nullable=True))
    op.add_column("leases", sa.Column("final_agreement_snapshot", JSONB, nullable=True))
    op.add_column("leases", sa.Column("onboarding_completed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "leases",
        sa.Column(
            "onboarding_payment_ids",
            JSONB,
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )

    # ── 3. lease_id FK on tenant_invites ──────────────────────────────────────
    op.add_column(
        "tenant_invites",
        sa.Column(
            "lease_id",
            UUID(as_uuid=True),
            sa.ForeignKey("leases.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_tenant_invites_lease_id", "tenant_invites", ["lease_id"])

    # ── 4. New system settings ────────────────────────────────────────────────
    _NEW_SETTINGS = [
        (
            "payments.auto_confirm_enabled",
            "false",
            "payments",
            "Auto-Confirm Payments",
            "When enabled, payments from configured methods are confirmed automatically "
            "without manager action. Disable to require manual confirmation for all payments.",
            "boolean",
            False,
            True,
        ),
        (
            "payments.auto_confirm_methods",
            "mobile_money_mtn,mobile_money_airtel",
            "payments",
            "Auto-Confirm Methods",
            "Comma-separated list of payment methods that trigger automatic confirmation "
            "when auto-confirm is enabled. Options: cash, bank_transfer, mobile_money_mtn, "
            "mobile_money_airtel.",
            "string",
            False,
            False,
        ),
        (
            "payments.advance_payment_months",
            "1",
            "payments",
            "Default Advance Rent Months",
            "Default number of months rent required in advance during tenant onboarding. "
            "Can be overridden per-property or per-unit via the billing rules.",
            "integer",
            False,
            True,
        ),
    ]
    conn = op.get_bind()
    for key, value, category, label, description, value_type, is_secret, is_required in _NEW_SETTINGS:
        conn.execute(
            sa.text(
                "INSERT INTO system_settings "
                "(key, value, category, label, description, value_type, is_secret, is_required) "
                "VALUES (:key, :value, :category, :label, :description, "
                ":value_type, :is_secret, :is_required) "
                "ON CONFLICT (key) DO NOTHING"
            ),
            {
                "key": key,
                "value": value,
                "category": category,
                "label": label,
                "description": description,
                "value_type": value_type,
                "is_secret": is_secret,
                "is_required": is_required,
            },
        )


def downgrade() -> None:
    # Reverse settings
    conn = op.get_bind()
    for key in (
        "payments.auto_confirm_enabled",
        "payments.auto_confirm_methods",
        "payments.advance_payment_months",
    ):
        conn.execute(
            sa.text("DELETE FROM system_settings WHERE key = :key"), {"key": key}
        )

    # Reverse lease_id index + column
    op.drop_index("ix_tenant_invites_lease_id", "tenant_invites")
    op.drop_column("tenant_invites", "lease_id")

    # Reverse new leases columns
    for col in (
        "onboarding_payment_ids",
        "onboarding_completed_at",
        "final_agreement_snapshot",
        "agreement_preview_snapshot",
        "terms_accepted_at",
    ):
        op.drop_column("leases", col)

    # Note: PostgreSQL does not support removing enum values without recreating the type.
    # New values are left in lease_status_enum on downgrade.
