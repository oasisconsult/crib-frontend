"""Add inspections and maintenance_issues tables

Revision ID: 006
Revises: 005
Create Date: 2026-03-29
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "006"
down_revision: str | None = "005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── Enum types ─────────────────────────────────────────────────────────────
    for stmt in [
        "DO $$ BEGIN CREATE TYPE inspection_type_enum AS ENUM "
        "('move_in','move_out','routine','maintenance','complaint'); "
        "EXCEPTION WHEN duplicate_object THEN null; END $$",

        "DO $$ BEGIN CREATE TYPE inspection_state_enum AS ENUM "
        "('scheduled','in_progress','completed','approved','failed','cancelled'); "
        "EXCEPTION WHEN duplicate_object THEN null; END $$",

        "DO $$ BEGIN CREATE TYPE maintenance_reporter_enum AS ENUM "
        "('tenant','landlord','inspector'); "
        "EXCEPTION WHEN duplicate_object THEN null; END $$",

        "DO $$ BEGIN CREATE TYPE maintenance_category_enum AS ENUM "
        "('plumbing','electrical','structural','appliance','pest','security','other'); "
        "EXCEPTION WHEN duplicate_object THEN null; END $$",

        "DO $$ BEGIN CREATE TYPE maintenance_priority_enum AS ENUM "
        "('low','medium','high','urgent'); "
        "EXCEPTION WHEN duplicate_object THEN null; END $$",

        "DO $$ BEGIN CREATE TYPE maintenance_state_enum AS ENUM "
        "('reported','assigned','in_progress','resolved','closed','cancelled'); "
        "EXCEPTION WHEN duplicate_object THEN null; END $$",
    ]:
        op.execute(stmt)

    # ── inspections ────────────────────────────────────────────────────────────
    op.create_table(
        "inspections",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("organisation_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("organisations.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("property_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("properties.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("unit_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("units.id", ondelete="SET NULL"),
                  nullable=True),
        sa.Column("lease_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("leases.id", ondelete="SET NULL"),
                  nullable=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("profiles.id", ondelete="SET NULL"),
                  nullable=True),
        sa.Column("inspector_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("profiles.id", ondelete="SET NULL"),
                  nullable=True),
        sa.Column("inspector_name", sa.String(255), nullable=True),

        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("state", sa.String(20), nullable=False, server_default="scheduled"),

        sa.Column("scheduled_date", sa.Date(), nullable=False),
        sa.Column("scheduled_time_slot", sa.String(50), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),

        sa.Column("checklist", postgresql.JSONB(), nullable=False,
                  server_default=sa.text("'[]'")),
        sa.Column("overall_condition", sa.String(20), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("recommendations", sa.Text(), nullable=True),

        sa.Column("photo_urls", postgresql.JSONB(), nullable=False,
                  server_default=sa.text("'[]'")),
        sa.Column("video_urls", postgresql.JSONB(), nullable=False,
                  server_default=sa.text("'[]'")),
        sa.Column("maintenance_issue_ids", postgresql.JSONB(), nullable=False,
                  server_default=sa.text("'[]'")),

        sa.Column("tenant_signed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("landlord_signed_at", sa.DateTime(timezone=True), nullable=True),

        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
    )
    op.create_index("ix_inspections_organisation_id", "inspections", ["organisation_id"])
    op.create_index("ix_inspections_property_id", "inspections", ["property_id"])
    op.create_index("ix_inspections_state", "inspections", ["state"])
    op.create_index("ix_inspections_scheduled_date", "inspections", ["scheduled_date"])

    # ── maintenance_issues ─────────────────────────────────────────────────────
    op.create_table(
        "maintenance_issues",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("organisation_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("organisations.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("property_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("properties.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("unit_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("units.id", ondelete="SET NULL"),
                  nullable=True),
        sa.Column("lease_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("leases.id", ondelete="SET NULL"),
                  nullable=True),
        sa.Column("inspection_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("inspections.id", ondelete="SET NULL"),
                  nullable=True),

        sa.Column("reported_by", sa.String(20), nullable=False),
        sa.Column("reported_by_id", sa.String(255), nullable=False),

        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("category", sa.String(20), nullable=False),
        sa.Column("priority", sa.String(10), nullable=False, server_default="medium"),
        sa.Column("state", sa.String(20), nullable=False, server_default="reported"),

        sa.Column("assigned_to", sa.String(255), nullable=True),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("estimated_cost", sa.Numeric(12, 2), nullable=True),
        sa.Column("actual_cost", sa.Numeric(12, 2), nullable=True),
        sa.Column("currency", sa.String(3), nullable=False, server_default="UGX"),

        sa.Column("reported_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),

        sa.Column("photo_urls", postgresql.JSONB(), nullable=False,
                  server_default=sa.text("'[]'")),
        sa.Column("notes", sa.Text(), nullable=True),

        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
    )
    op.create_index("ix_maintenance_issues_organisation_id", "maintenance_issues", ["organisation_id"])
    op.create_index("ix_maintenance_issues_property_id", "maintenance_issues", ["property_id"])
    op.create_index("ix_maintenance_issues_state", "maintenance_issues", ["state"])
    op.create_index("ix_maintenance_issues_priority", "maintenance_issues", ["priority"])


def downgrade() -> None:
    op.drop_table("maintenance_issues")
    op.drop_table("inspections")

    for enum in [
        "maintenance_state_enum",
        "maintenance_priority_enum",
        "maintenance_category_enum",
        "maintenance_reporter_enum",
        "inspection_state_enum",
        "inspection_type_enum",
    ]:
        op.execute(f"DROP TYPE IF EXISTS {enum}")
