"""Add rent_increases table

Revision ID: 049
Revises: 048
Create Date: 2026-06-12
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "049"
down_revision = "048"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("CREATE TYPE rent_increase_status_enum AS ENUM ('pending_ack','acknowledged','applied','withdrawn')"))

    op.create_table(
        "rent_increases",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organisation_id", UUID(as_uuid=True), sa.ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("lease_id", UUID(as_uuid=True), sa.ForeignKey("leases.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("property_id", UUID(as_uuid=True), sa.ForeignKey("properties.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("unit_id", UUID(as_uuid=True), sa.ForeignKey("units.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("issued_by", sa.String(255), nullable=False),
        sa.Column("status", sa.Enum("pending_ack", "acknowledged", "applied", "withdrawn", name="rent_increase_status_enum", create_type=False), nullable=False, server_default="pending_ack"),
        sa.Column("current_rent", sa.Numeric(12, 2), nullable=False),
        sa.Column("new_rent", sa.Numeric(12, 2), nullable=False),
        sa.Column("increase_pct", sa.Numeric(5, 2), nullable=False),
        sa.Column("effective_date", sa.Date, nullable=False),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("applied_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("withdrawn_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notice_pdf_url", sa.String(500), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), onupdate=sa.text("now()"), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("rent_increases")
    op.execute(sa.text("DROP TYPE IF EXISTS rent_increase_status_enum"))
