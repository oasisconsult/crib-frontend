"""053 — Add EFRIS tracking columns to payments table

Revision ID: 053
Revises: 052
Create Date: 2026-06-13
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "053"
down_revision: str | None = "052"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    conn.execute(sa.text("""
        ALTER TABLE payments
            ADD COLUMN IF NOT EXISTS efris_status          VARCHAR(32),
            ADD COLUMN IF NOT EXISTS efris_receipt_number  VARCHAR(64),
            ADD COLUMN IF NOT EXISTS efris_receipt_date    TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS efris_failure_reason  TEXT,
            ADD COLUMN IF NOT EXISTS efris_retry_count     INTEGER NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS efris_fiscal_receipt_url TEXT,
            ADD COLUMN IF NOT EXISTS efris_anti_fake_code  VARCHAR(128),
            ADD COLUMN IF NOT EXISTS efris_qr_code         TEXT
    """))

    # Partial unique index — only enforces uniqueness on non-null values
    conn.execute(sa.text("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_efris_receipt_number
            ON payments(efris_receipt_number)
            WHERE efris_receipt_number IS NOT NULL
    """))

    # Partial index — only indexes rows that have been through EFRIS
    conn.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS ix_payments_efris_status
            ON payments(efris_status)
            WHERE efris_status IS NOT NULL
    """))


def downgrade() -> None:
    conn = op.get_bind()

    conn.execute(sa.text("DROP INDEX IF EXISTS ix_payments_efris_status"))
    conn.execute(sa.text("DROP INDEX IF EXISTS uq_payments_efris_receipt_number"))

    conn.execute(sa.text("""
        ALTER TABLE payments
            DROP COLUMN IF EXISTS efris_status,
            DROP COLUMN IF EXISTS efris_receipt_number,
            DROP COLUMN IF EXISTS efris_receipt_date,
            DROP COLUMN IF EXISTS efris_failure_reason,
            DROP COLUMN IF EXISTS efris_retry_count,
            DROP COLUMN IF EXISTS efris_fiscal_receipt_url,
            DROP COLUMN IF EXISTS efris_anti_fake_code,
            DROP COLUMN IF EXISTS efris_qr_code
    """))
