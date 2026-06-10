"""
040 — GeoBox geocode columns on properties and units

Adds a nullable `geocode` column (VARCHAR 20) to both tables. Partial indexes
avoid indexing the large number of rows that will remain NULL.

Column is intentionally nullable so all existing data and API callers are
unaffected — no default, no backfill required.

Revision ID: 040
Revises: 039
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "040"
down_revision = "039"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    prop_cols = {c["name"] for c in inspector.get_columns("properties")}
    if "geocode" not in prop_cols:
        op.add_column("properties", sa.Column("geocode", sa.String(20), nullable=True))
        op.create_index(
            "ix_properties_geocode",
            "properties",
            ["geocode"],
            postgresql_where=sa.text("geocode IS NOT NULL"),
        )

    unit_cols = {c["name"] for c in inspector.get_columns("units")}
    if "geocode" not in unit_cols:
        op.add_column("units", sa.Column("geocode", sa.String(20), nullable=True))
        op.create_index(
            "ix_units_geocode",
            "units",
            ["geocode"],
            postgresql_where=sa.text("geocode IS NOT NULL"),
        )


def downgrade() -> None:
    op.drop_index("ix_units_geocode",      table_name="units")
    op.drop_index("ix_properties_geocode", table_name="properties")
    op.drop_column("units",      "geocode")
    op.drop_column("properties", "geocode")
