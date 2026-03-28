"""Properties and Units tables

Revision ID: 002
Revises: 001
Create Date: 2026-03-28
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "002"
down_revision: str | None = "001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("DO $$ BEGIN CREATE TYPE property_type_enum AS ENUM ('flat', 'house', 'hostel', 'commercial', 'villa'); EXCEPTION WHEN duplicate_object THEN null; END $$")
    op.execute("DO $$ BEGIN CREATE TYPE property_status_enum AS ENUM ('active', 'inactive', 'maintenance'); EXCEPTION WHEN duplicate_object THEN null; END $$")
    op.execute("DO $$ BEGIN CREATE TYPE unit_type_enum AS ENUM ('single', 'double', 'studio', 'ensuite', 'shared'); EXCEPTION WHEN duplicate_object THEN null; END $$")
    op.execute("DO $$ BEGIN CREATE TYPE unit_status_enum AS ENUM ('available', 'occupied', 'reserved', 'maintenance'); EXCEPTION WHEN duplicate_object THEN null; END $$")

    # ── properties ────────────────────────────────────────────────────────────
    op.create_table(
        "properties",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("organisation_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("type",
                  postgresql.ENUM("flat", "house", "hostel", "commercial", "villa",
                                  name="property_type_enum", create_type=False), nullable=False),
        sa.Column("status",
                  postgresql.ENUM("active", "inactive", "maintenance",
                                  name="property_status_enum", create_type=False),
                  nullable=False, server_default="active"),
        sa.Column("address", postgresql.JSONB(astext_type=sa.Text()), nullable=False,
                  server_default="{}"),
        sa.Column("rules", postgresql.JSONB(astext_type=sa.Text()), nullable=False,
                  server_default="{}"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("cover_image", sa.String(1024), nullable=True),
        sa.Column("images", postgresql.JSONB(astext_type=sa.Text()), nullable=False,
                  server_default="[]"),
        sa.Column("tags", postgresql.JSONB(astext_type=sa.Text()), nullable=False,
                  server_default="[]"),
        sa.Column("amenities", postgresql.JSONB(astext_type=sa.Text()), nullable=False,
                  server_default="[]"),
        sa.Column("currency", sa.String(3), nullable=False, server_default="UGX"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
    )
    op.create_index("ix_properties_organisation_id", "properties", ["organisation_id"])
    op.create_index("ix_properties_status", "properties", ["status"])

    # ── units ─────────────────────────────────────────────────────────────────
    op.create_table(
        "units",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("property_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("properties.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("type",
                  postgresql.ENUM("single", "double", "studio", "ensuite", "shared",
                                  name="unit_type_enum", create_type=False), nullable=False),
        sa.Column("status",
                  postgresql.ENUM("available", "occupied", "reserved", "maintenance",
                                  name="unit_status_enum", create_type=False),
                  nullable=False, server_default="available"),
        sa.Column("floor", sa.Integer(), nullable=True),
        sa.Column("area", sa.Float(), nullable=True),
        sa.Column("monthly_rent", sa.Float(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="UGX"),
        sa.Column("bedrooms", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("bathrooms", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("amenities", postgresql.JSONB(astext_type=sa.Text()), nullable=False,
                  server_default="[]"),
        sa.Column("images", postgresql.JSONB(astext_type=sa.Text()), nullable=False,
                  server_default="[]"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("rules", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("current_tenant_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("tenants.id", ondelete="SET NULL"), nullable=True),
        sa.Column("current_lease_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("last_inspection_date", sa.String(30), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
    )
    op.create_index("ix_units_property_id", "units", ["property_id"])
    op.create_index("ix_units_status", "units", ["status"])
    op.create_index("ix_units_current_tenant_id", "units", ["current_tenant_id"])

    # ── updated_at triggers ───────────────────────────────────────────────────
    for table in ("properties", "units"):
        op.execute(f"""
            CREATE TRIGGER trg_{table}_updated_at
            BEFORE UPDATE ON {table}
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        """)


def downgrade() -> None:
    for table in ("properties", "units"):
        op.execute(f"DROP TRIGGER IF EXISTS trg_{table}_updated_at ON {table}")

    op.drop_table("units")
    op.drop_table("properties")

    op.execute("DROP TYPE IF EXISTS unit_status_enum")
    op.execute("DROP TYPE IF EXISTS unit_type_enum")
    op.execute("DROP TYPE IF EXISTS property_status_enum")
    op.execute("DROP TYPE IF EXISTS property_type_enum")
