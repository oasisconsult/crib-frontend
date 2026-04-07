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
    # ── 1. Enum type (idempotent) ─────────────────────────────────────────────
    op.execute(
        "DO $$ BEGIN "
        "CREATE TYPE tenancy_agreement_status_enum AS ENUM "
        "('draft','tenant_signed','fully_executed'); "
        "EXCEPTION WHEN duplicate_object THEN null; END $$"
    )

    # ── 2. tenancy_agreements table ───────────────────────────────────────────
    # Use raw DDL to avoid SQLAlchemy auto-emitting a second CREATE TYPE for the
    # status column enum even when create_type=False is set (SA behaviour in
    # op.create_table differs from op.add_column in this regard).
    op.execute("""
        CREATE TABLE IF NOT EXISTS tenancy_agreements (
            id              UUID        NOT NULL DEFAULT gen_random_uuid(),
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            lease_id        UUID        NOT NULL
                REFERENCES leases(id) ON DELETE CASCADE,
            rendered_html   TEXT        NOT NULL,
            status          tenancy_agreement_status_enum NOT NULL DEFAULT 'draft',
            tenant_signature_data_url   TEXT,
            tenant_signed_at            TIMESTAMPTZ,
            tenant_ip                   VARCHAR(45),
            landlord_signature_data_url TEXT,
            landlord_signed_at          TIMESTAMPTZ,
            landlord_signer_id          VARCHAR(100),
            landlord_signer_name        VARCHAR(255),
            PRIMARY KEY (id)
        )
    """)
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_tenancy_agreements_lease_id "
        "ON tenancy_agreements (lease_id)"
    )

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
