"""
020 — Human-readable reference columns

Adds a `reference` VARCHAR(40) column (unique, indexed) to five tables:
  inspections, maintenance_issues, tenants, units, rent_schedules

Backfills existing rows with sequential references using ROW_NUMBER() so
every existing record gets a human-readable ID immediately.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "020"
down_revision: str | None = "019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── 1. Add nullable reference columns ─────────────────────────────────────
    for table in ("inspections", "maintenance_issues", "tenants", "units", "rent_schedules"):
        op.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS reference VARCHAR(40)")

    # ── 2. Backfill: inspections (INS-YYYY-NNNN) ──────────────────────────────
    op.execute("""
        WITH ranked AS (
          SELECT id,
            'INS-' || EXTRACT(YEAR FROM created_at)::TEXT || '-'
            || LPAD(ROW_NUMBER() OVER (
                PARTITION BY EXTRACT(YEAR FROM created_at)
                ORDER BY created_at
               )::TEXT, 4, '0') AS ref
          FROM inspections WHERE reference IS NULL
        )
        UPDATE inspections SET reference = ranked.ref FROM ranked WHERE inspections.id = ranked.id
    """)

    # ── 3. Backfill: maintenance_issues (MNT-YYYY-NNNN) ──────────────────────
    op.execute("""
        WITH ranked AS (
          SELECT id,
            'MNT-' || EXTRACT(YEAR FROM created_at)::TEXT || '-'
            || LPAD(ROW_NUMBER() OVER (
                PARTITION BY EXTRACT(YEAR FROM created_at)
                ORDER BY created_at
               )::TEXT, 4, '0') AS ref
          FROM maintenance_issues WHERE reference IS NULL
        )
        UPDATE maintenance_issues SET reference = ranked.ref FROM ranked WHERE maintenance_issues.id = ranked.id
    """)

    # ── 4. Backfill: tenants (TEN-NNNN) ──────────────────────────────────────
    op.execute("""
        WITH ranked AS (
          SELECT id, 'TEN-' || LPAD(ROW_NUMBER() OVER (ORDER BY created_at)::TEXT, 4, '0') AS ref
          FROM tenants WHERE reference IS NULL
        )
        UPDATE tenants SET reference = ranked.ref FROM ranked WHERE tenants.id = ranked.id
    """)

    # ── 5. Backfill: units (UNIT-NNNN) ───────────────────────────────────────
    op.execute("""
        WITH ranked AS (
          SELECT id, 'UNIT-' || LPAD(ROW_NUMBER() OVER (ORDER BY created_at)::TEXT, 4, '0') AS ref
          FROM units WHERE reference IS NULL
        )
        UPDATE units SET reference = ranked.ref FROM ranked WHERE units.id = ranked.id
    """)

    # ── 6. Backfill: rent_schedules (RS-YYYYMM-NNNN) ─────────────────────────
    op.execute("""
        WITH ranked AS (
          SELECT id,
            'RS-' || TO_CHAR(period_start, 'YYYYMM') || '-'
            || LPAD(ROW_NUMBER() OVER (
                PARTITION BY TO_CHAR(period_start, 'YYYYMM')
                ORDER BY created_at
               )::TEXT, 4, '0') AS ref
          FROM rent_schedules WHERE reference IS NULL
        )
        UPDATE rent_schedules SET reference = ranked.ref FROM ranked WHERE rent_schedules.id = ranked.id
    """)

    # ── 7. Add unique indexes ─────────────────────────────────────────────────
    for table in ("inspections", "maintenance_issues", "tenants", "units", "rent_schedules"):
        op.execute(
            f"CREATE UNIQUE INDEX IF NOT EXISTS uq_{table}_reference "
            f"ON {table} (reference) WHERE reference IS NOT NULL"
        )


def downgrade() -> None:
    for table in ("inspections", "maintenance_issues", "tenants", "units", "rent_schedules"):
        op.execute(f"DROP INDEX IF EXISTS uq_{table}_reference")
        op.execute(f"ALTER TABLE {table} DROP COLUMN IF EXISTS reference")
