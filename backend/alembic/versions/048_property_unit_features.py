"""Add Uganda property and unit feature columns

Revision ID: 048
Revises: 047
Create Date: 2026-06-12
"""

from alembic import op
import sqlalchemy as sa

revision = "048"
down_revision = "047"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Phase 1: Extend existing enum types ────────────────────────────────────
    # ALTER TYPE ADD VALUE cannot run inside a PostgreSQL transaction block.
    # Commit the implicit Alembic transaction, extend enums in autocommit,
    # then open a fresh transaction for the remaining DDL.
    op.execute(sa.text("COMMIT"))

    for v in ("bedsitter", "one_bed", "two_bed", "three_bed", "four_bed_plus"):
        op.execute(sa.text(f"ALTER TYPE unit_type_enum ADD VALUE IF NOT EXISTS '{v}'"))

    for v in ("bungalow", "maisonette", "townhouse", "bedsitter_block"):
        op.execute(sa.text(f"ALTER TYPE property_type_enum ADD VALUE IF NOT EXISTS '{v}'"))

    op.execute(sa.text("BEGIN"))

    # ── Phase 2: Create new enum types (idempotent) ───────────────────────────
    for ddl in (
        "DO $$ BEGIN CREATE TYPE furnished_status_enum AS ENUM ('unfurnished', 'semi_furnished', 'furnished'); EXCEPTION WHEN duplicate_object THEN NULL; END $$",
        "DO $$ BEGIN CREATE TYPE water_source_enum AS ENUM ('municipal', 'borehole', 'tank', 'multiple'); EXCEPTION WHEN duplicate_object THEN NULL; END $$",
        "DO $$ BEGIN CREATE TYPE backup_power_enum AS ENUM ('none', 'solar', 'generator', 'both'); EXCEPTION WHEN duplicate_object THEN NULL; END $$",
        "DO $$ BEGIN CREATE TYPE internet_type_enum AS ENUM ('none', 'wifi', 'fibre'); EXCEPTION WHEN duplicate_object THEN NULL; END $$",
        "DO $$ BEGIN CREATE TYPE compound_type_enum AS ENUM ('private', 'shared'); EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    ):
        op.execute(sa.text(ddl))

    # ── Phase 3: Migrate existing unit type data to new labels ─────────────────
    op.execute(sa.text("UPDATE units SET type = 'bedsitter' WHERE type = 'single'"))
    op.execute(sa.text("UPDATE units SET type = 'two_bed'   WHERE type = 'double'"))
    op.execute(sa.text("UPDATE units SET type = 'one_bed'   WHERE type = 'ensuite'"))
    op.execute(sa.text("UPDATE units SET type = 'bedsitter' WHERE type = 'shared'"))

    # ── Phase 4: Add new property columns (IF NOT EXISTS = idempotent) ────────
    for ddl in (
        "ALTER TABLE properties ADD COLUMN IF NOT EXISTS total_floors        INTEGER  NOT NULL DEFAULT 1",
        "ALTER TABLE properties ADD COLUMN IF NOT EXISTS year_built          INTEGER  NULL",
        "ALTER TABLE properties ADD COLUMN IF NOT EXISTS land_size_acres     FLOAT    NULL",
        "ALTER TABLE properties ADD COLUMN IF NOT EXISTS has_perimeter_wall  BOOLEAN  NOT NULL DEFAULT FALSE",
        "ALTER TABLE properties ADD COLUMN IF NOT EXISTS has_gate            BOOLEAN  NOT NULL DEFAULT FALSE",
        "ALTER TABLE properties ADD COLUMN IF NOT EXISTS has_guard           BOOLEAN  NOT NULL DEFAULT FALSE",
        "ALTER TABLE properties ADD COLUMN IF NOT EXISTS has_cctv            BOOLEAN  NOT NULL DEFAULT FALSE",
        "ALTER TABLE properties ADD COLUMN IF NOT EXISTS total_parking_spaces INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE properties ADD COLUMN IF NOT EXISTS water_source    water_source_enum  NOT NULL DEFAULT 'municipal'",
        "ALTER TABLE properties ADD COLUMN IF NOT EXISTS backup_power    backup_power_enum  NOT NULL DEFAULT 'none'",
        "ALTER TABLE properties ADD COLUMN IF NOT EXISTS internet_type   internet_type_enum NOT NULL DEFAULT 'none'",
        "ALTER TABLE properties ADD COLUMN IF NOT EXISTS compound_type   compound_type_enum NOT NULL DEFAULT 'private'",
    ):
        op.execute(sa.text(ddl))

    # ── Phase 5: Add new unit columns (IF NOT EXISTS = idempotent) ─────────
    for ddl in (
        "ALTER TABLE units ADD COLUMN IF NOT EXISTS sitting_rooms          INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE units ADD COLUMN IF NOT EXISTS toilets                INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE units ADD COLUMN IF NOT EXISTS is_self_contained      BOOLEAN NOT NULL DEFAULT TRUE",
        "ALTER TABLE units ADD COLUMN IF NOT EXISTS has_kitchen            BOOLEAN NOT NULL DEFAULT TRUE",
        "ALTER TABLE units ADD COLUMN IF NOT EXISTS has_store              BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE units ADD COLUMN IF NOT EXISTS has_domestic_quarters  BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE units ADD COLUMN IF NOT EXISTS parking_spaces         INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE units ADD COLUMN IF NOT EXISTS furnished_status furnished_status_enum NOT NULL DEFAULT 'unfurnished'",
        "ALTER TABLE units ADD COLUMN IF NOT EXISTS water_source     water_source_enum     NULL",
    ):
        op.execute(sa.text(ddl))


def downgrade() -> None:
    # Remove unit columns
    for col in (
        "sitting_rooms", "toilets", "is_self_contained", "has_kitchen",
        "has_store", "has_domestic_quarters", "parking_spaces",
        "furnished_status", "water_source",
    ):
        op.execute(sa.text(f"ALTER TABLE units DROP COLUMN IF EXISTS {col}"))

    # Remove property columns
    for col in (
        "total_floors", "year_built", "land_size_acres", "has_perimeter_wall",
        "has_gate", "has_guard", "has_cctv", "total_parking_spaces",
        "water_source", "backup_power", "internet_type", "compound_type",
    ):
        op.execute(sa.text(f"ALTER TABLE properties DROP COLUMN IF EXISTS {col}"))

    # Drop new enum types
    for t in (
        "furnished_status_enum", "water_source_enum", "backup_power_enum",
        "internet_type_enum", "compound_type_enum",
    ):
        op.execute(sa.text(f"DROP TYPE IF EXISTS {t}"))

    # Note: cannot remove values from unit_type_enum / property_type_enum in PostgreSQL.
