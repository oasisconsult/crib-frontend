"""029 — Rename subscription_audit_log.metadata → event_data

Revision ID: 029
Revises: 028
Create Date: 2026-05-19

'metadata' is reserved by SQLAlchemy's DeclarativeBase (it is the MetaData
object on every mapped class).  Naming a column 'metadata' causes:
    InvalidRequestError: Attribute name 'metadata' is reserved.

Rename to 'event_data' which is unambiguous and descriptive.

The migration is idempotent:
  - If the column is still named 'metadata'  → renamed to 'event_data'
  - If the column is already 'event_data'    → no-op
  - If neither column exists                 → adds 'event_data'
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "029"
down_revision: str | None = "028"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("""
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'subscription_audit_log'
                  AND column_name = 'metadata'
            ) THEN
                ALTER TABLE subscription_audit_log
                    RENAME COLUMN metadata TO event_data;

            ELSIF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'subscription_audit_log'
                  AND column_name = 'event_data'
            ) THEN
                ALTER TABLE subscription_audit_log
                    ADD COLUMN event_data JSONB NOT NULL DEFAULT '{}'::jsonb;
            END IF;
        END $$;
    """))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("""
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'subscription_audit_log'
                  AND column_name = 'event_data'
            ) THEN
                ALTER TABLE subscription_audit_log
                    RENAME COLUMN event_data TO metadata;
            END IF;
        END $$;
    """))
