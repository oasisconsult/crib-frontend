"""Create tenant_screenings table.

Revision ID: 062
Revises: 061
Create Date: 2026-06-17
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "062"
down_revision = "061"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tenant_screenings",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organisation_id", UUID(as_uuid=True), sa.ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("unit_id", UUID(as_uuid=True), sa.ForeignKey("units.id", ondelete="SET NULL"), nullable=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="SET NULL"), nullable=True),
        sa.Column("applicant_name", sa.String(200), nullable=False),
        sa.Column("applicant_phone", sa.String(50), nullable=True),
        sa.Column("applicant_email", sa.String(255), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("checklist", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("decision_notes", sa.Text, nullable=True),
        sa.Column("created_by_id", UUID(as_uuid=True), sa.ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True),
        sa.Column("decided_by_id", UUID(as_uuid=True), sa.ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_tenant_screenings_org", "tenant_screenings", ["organisation_id", "created_at"])
    op.create_index("ix_tenant_screenings_unit", "tenant_screenings", ["unit_id"])


def downgrade() -> None:
    op.drop_index("ix_tenant_screenings_unit", "tenant_screenings")
    op.drop_index("ix_tenant_screenings_org", "tenant_screenings")
    op.drop_table("tenant_screenings")
