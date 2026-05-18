"""027 — Rename plan enum values (starter→free, growth→professional, add agency)

Revision ID: 027
Revises: 026
Create Date: 2026-05-18

Maps legacy plan names to the new four-tier subscription model:
  starter    → free
  growth     → professional
  (new)      → agency
  enterprise → enterprise (unchanged)

PostgreSQL 10+ supports ALTER TYPE ... RENAME VALUE natively.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "027"
down_revision: str | None = "026"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Rename existing values
    op.execute("ALTER TYPE plan_enum RENAME VALUE 'starter' TO 'free'")
    op.execute("ALTER TYPE plan_enum RENAME VALUE 'growth' TO 'professional'")
    # Add new agency tier
    op.execute("ALTER TYPE plan_enum ADD VALUE IF NOT EXISTS 'agency'")


def downgrade() -> None:
    # Revert agency → remove is not possible cleanly; rename back
    op.execute("ALTER TYPE plan_enum RENAME VALUE 'free' TO 'starter'")
    op.execute("ALTER TYPE plan_enum RENAME VALUE 'professional' TO 'growth'")
    # Cannot drop an enum value in PostgreSQL; leave agency in place
