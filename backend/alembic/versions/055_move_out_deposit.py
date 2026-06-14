"""055 — Move-out inspection: baseline FK on inspections, move-out inspection FK on deposits

Revision ID: 055
Revises: 054
Create Date: 2026-06-14

Adds:
  inspections.baseline_inspection_id  — move-out references its move-in baseline
  deposits.move_out_inspection_id     — links deposit return to move-out evidence
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "055"
down_revision: str | None = "054"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # ── inspections.baseline_inspection_id ────────────────────────────────────
    conn.execute(sa.text("""
        ALTER TABLE inspections
        ADD COLUMN IF NOT EXISTS baseline_inspection_id UUID
            REFERENCES inspections(id) ON DELETE SET NULL
    """))

    # ── deposits.move_out_inspection_id ───────────────────────────────────────
    conn.execute(sa.text("""
        ALTER TABLE deposits
        ADD COLUMN IF NOT EXISTS move_out_inspection_id UUID
            REFERENCES inspections(id) ON DELETE SET NULL
    """))


def downgrade() -> None:
    conn = op.get_bind()

    conn.execute(sa.text("ALTER TABLE deposits DROP COLUMN IF EXISTS move_out_inspection_id"))
    conn.execute(sa.text("ALTER TABLE inspections DROP COLUMN IF EXISTS baseline_inspection_id"))
