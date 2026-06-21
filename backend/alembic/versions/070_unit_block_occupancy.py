"""Add block, max_occupants, bathroom_type to units; replace is_self_contained

Revision ID: 070
Revises: 069
Create Date: 2026-06-21

Supports Lydia-class hostel requirements:
- block: which physical block a unit belongs to ("Block A", "Block B", ...)
- max_occupants: how many tenants can live in the unit (1=single, 2=double, etc.)
- bathroom_type enum: self_contained | semi_shared | communal
  Replaces the boolean is_self_contained (migrated: True → self_contained,
  False → communal; is_self_contained column is kept for a safe dual-write
  period and will be dropped in a later migration).
"""
from alembic import op
import sqlalchemy as sa

revision = "070"
down_revision = "069"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # bathroom_type_enum cannot be created inside a transaction block
    op.execute(sa.text("COMMIT"))
    op.execute(sa.text(
        "DO $$ BEGIN "
        "  CREATE TYPE bathroom_type_enum AS ENUM ('self_contained', 'semi_shared', 'communal'); "
        "EXCEPTION WHEN duplicate_object THEN NULL; END $$"
    ))
    op.execute(sa.text("BEGIN"))

    # Add new columns
    op.execute(sa.text(
        "ALTER TABLE units ADD COLUMN IF NOT EXISTS block VARCHAR(100) NULL"
    ))
    op.execute(sa.text(
        "ALTER TABLE units ADD COLUMN IF NOT EXISTS max_occupants INTEGER NOT NULL DEFAULT 1"
    ))
    op.execute(sa.text(
        "ALTER TABLE units ADD COLUMN IF NOT EXISTS bathroom_type bathroom_type_enum NOT NULL DEFAULT 'self_contained'"
    ))

    # Back-fill bathroom_type from existing is_self_contained:
    # is_self_contained=True  → self_contained
    # is_self_contained=False → communal (semi_shared didn't exist before)
    op.execute(sa.text(
        "UPDATE units SET bathroom_type = 'self_contained' WHERE is_self_contained = TRUE"
    ))
    op.execute(sa.text(
        "UPDATE units SET bathroom_type = 'communal' WHERE is_self_contained = FALSE"
    ))

    # Back-fill max_occupants from bedrooms where a sensible default can be derived.
    # bedsitter-class units had max_occupants implicitly 1; studio/one_bed = 1;
    # two_bed = 2; three_bed = 3; four_bed_plus = 4.
    op.execute(sa.text(
        "UPDATE units SET max_occupants = CASE type "
        "  WHEN 'two_bed'       THEN 2 "
        "  WHEN 'three_bed'     THEN 3 "
        "  WHEN 'four_bed_plus' THEN 4 "
        "  ELSE 1 "
        "END"
    ))

    # Index block for filtering
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_units_block ON units (property_id, block) WHERE block IS NOT NULL"
    ))


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS ix_units_block"))
    op.execute(sa.text("ALTER TABLE units DROP COLUMN IF EXISTS bathroom_type"))
    op.execute(sa.text("ALTER TABLE units DROP COLUMN IF EXISTS max_occupants"))
    op.execute(sa.text("ALTER TABLE units DROP COLUMN IF EXISTS block"))
    op.execute(sa.text("DROP TYPE IF EXISTS bathroom_type_enum"))
