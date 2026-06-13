"""Add rent_increases table

Revision ID: 049
Revises: 048
Create Date: 2026-06-12
"""

from alembic import op
import sqlalchemy as sa

revision = "049"
down_revision = "048"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create enum idempotently — op.create_table emits its own CREATE TYPE even with
    # create_type=False, so we use raw SQL for both objects to stay fully idempotent
    # across container restarts and partial failures.
    op.execute(sa.text(
        "DO $$ BEGIN "
        "CREATE TYPE rent_increase_status_enum AS ENUM "
        "('pending_ack','acknowledged','applied','withdrawn'); "
        "EXCEPTION WHEN duplicate_object THEN null; "
        "END $$"
    ))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS rent_increases (
            id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            organisation_id   UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
            lease_id          UUID        NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
            property_id       UUID        REFERENCES properties(id) ON DELETE SET NULL,
            unit_id           UUID        REFERENCES units(id) ON DELETE SET NULL,
            tenant_id         UUID        REFERENCES tenants(id) ON DELETE SET NULL,
            issued_by         VARCHAR(255) NOT NULL,
            status            rent_increase_status_enum NOT NULL DEFAULT 'pending_ack',
            current_rent      NUMERIC(12,2) NOT NULL,
            new_rent          NUMERIC(12,2) NOT NULL,
            increase_pct      NUMERIC(5,2)  NOT NULL,
            effective_date    DATE          NOT NULL,
            issued_at         TIMESTAMPTZ   NOT NULL,
            acknowledged_at   TIMESTAMPTZ,
            applied_at        TIMESTAMPTZ,
            withdrawn_at      TIMESTAMPTZ,
            notice_pdf_url    VARCHAR(500),
            notes             TEXT,
            created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
            updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now()
        )
    """))

    # Indexes (IF NOT EXISTS guards against re-runs)
    for col in ("organisation_id", "lease_id", "property_id", "unit_id", "tenant_id", "status"):
        op.execute(sa.text(
            f"CREATE INDEX IF NOT EXISTS ix_rent_increases_{col} ON rent_increases ({col})"
        ))


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS rent_increases"))
    op.execute(sa.text("DROP TYPE IF EXISTS rent_increase_status_enum"))
