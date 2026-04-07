"""
014 – Tenancy agreements, tenant NIN, organisation payment settings

Changes:
  1. Add tenancy_agreement_status_enum
  2. Create tenancy_agreements table (dual-signature workflow)
  3. Add tenants.nin  (National ID Number)
  4. Add organisations.payment_settings  (JSONB, per-org payment method config)
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. Enum type ──────────────────────────────────────────────────────────
    op.execute(
        "DO $$ BEGIN "
        "CREATE TYPE tenancy_agreement_status_enum AS ENUM "
        "('draft','tenant_signed','fully_executed'); "
        "EXCEPTION WHEN duplicate_object THEN null; END $$"
    )

    # ── 2. tenancy_agreements table ───────────────────────────────────────────
    op.create_table(
        "tenancy_agreements",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True),
                  server_default=sa.text("gen_random_uuid()"),
                  nullable=False, primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
        sa.Column("lease_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("rendered_html", sa.Text, nullable=False),
        sa.Column(
            "status",
            sa.Enum("draft", "tenant_signed", "fully_executed",
                    name="tenancy_agreement_status_enum", create_type=False),
            nullable=False,
            server_default="draft",
        ),
        sa.Column("tenant_signature_data_url", sa.Text, nullable=True),
        sa.Column("tenant_signed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("tenant_ip", sa.String(45), nullable=True),
        sa.Column("landlord_signature_data_url", sa.Text, nullable=True),
        sa.Column("landlord_signed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("landlord_signer_id", sa.String(100), nullable=True),
        sa.Column("landlord_signer_name", sa.String(255), nullable=True),
        sa.ForeignKeyConstraint(["lease_id"], ["leases.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_tenancy_agreements_lease_id", "tenancy_agreements", ["lease_id"], unique=True)

    # ── 3. tenants.nin ────────────────────────────────────────────────────────
    op.add_column("tenants", sa.Column("nin", sa.String(50), nullable=True))

    # ── 4. organisations.payment_settings ─────────────────────────────────────
    op.add_column(
        "organisations",
        sa.Column(
            "payment_settings",
            JSONB,
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("organisations", "payment_settings")
    op.drop_column("tenants", "nin")
    op.drop_index("ix_tenancy_agreements_lease_id", "tenancy_agreements")
    op.drop_table("tenancy_agreements")
    op.execute("DROP TYPE IF EXISTS tenancy_agreement_status_enum")
