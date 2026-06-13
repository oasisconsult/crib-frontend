"""Add eviction_notices table

Revision ID: 050
Revises: 049
Create Date: 2026-06-13
"""

from alembic import op
import sqlalchemy as sa

revision = "050"
down_revision = "049"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create enums idempotently via raw SQL (avoids SQLAlchemy/Alembic bug where
    # create_type=False is ignored inside op.create_table)
    op.execute(sa.text(
        "DO $$ BEGIN "
        "CREATE TYPE eviction_notice_type_enum AS ENUM "
        "('non_payment','breach','end_of_term','redevelopment'); "
        "EXCEPTION WHEN duplicate_object THEN null; "
        "END $$"
    ))
    op.execute(sa.text(
        "DO $$ BEGIN "
        "CREATE TYPE eviction_notice_status_enum AS ENUM "
        "('issued','served','disputed','withdrawn','executed'); "
        "EXCEPTION WHEN duplicate_object THEN null; "
        "END $$"
    ))
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS eviction_notices (
            id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            organisation_id   UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
            lease_id          UUID NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
            property_id       UUID REFERENCES properties(id) ON DELETE SET NULL,
            unit_id           UUID REFERENCES units(id) ON DELETE SET NULL,
            tenant_id         UUID REFERENCES tenants(id) ON DELETE SET NULL,
            issued_by         VARCHAR(255) NOT NULL,
            notice_type       eviction_notice_type_enum NOT NULL,
            status            eviction_notice_status_enum NOT NULL DEFAULT 'issued',
            reason            TEXT NOT NULL,
            effective_date    DATE NOT NULL,
            court_reference   VARCHAR(255),
            issued_at         TIMESTAMPTZ NOT NULL,
            served_at         TIMESTAMPTZ,
            disputed_at       TIMESTAMPTZ,
            withdrawn_at      TIMESTAMPTZ,
            executed_at       TIMESTAMPTZ,
            notice_pdf_url    VARCHAR(500),
            notes             TEXT,
            created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))

    for col in ("organisation_id", "lease_id", "property_id", "unit_id", "tenant_id",
                "notice_type", "status"):
        op.execute(sa.text(
            f"CREATE INDEX IF NOT EXISTS ix_eviction_notices_{col} "
            f"ON eviction_notices ({col})"
        ))

    # updated_at trigger (same pattern as every other table)
    op.execute(sa.text("""
        DO $$ BEGIN
          CREATE TRIGGER eviction_notices_updated_at
            BEFORE UPDATE ON eviction_notices
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        EXCEPTION WHEN duplicate_object THEN null;
        END $$
    """))


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS eviction_notices"))
    op.execute(sa.text("DROP TYPE IF EXISTS eviction_notice_type_enum"))
    op.execute(sa.text("DROP TYPE IF EXISTS eviction_notice_status_enum"))
