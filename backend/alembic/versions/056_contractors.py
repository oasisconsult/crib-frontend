"""Add contractors table and contractor_id FK on maintenance_issues

Revision ID: 056
Revises: 055
Create Date: 2026-06-15
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "056"
down_revision: str | None = "055"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "contractors",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("organisation_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("organisations.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("specialty", sa.String(20), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
    )
    op.create_index("ix_contractors_organisation_id", "contractors", ["organisation_id"])

    op.add_column(
        "maintenance_issues",
        sa.Column("contractor_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("contractors.id", ondelete="SET NULL"),
                  nullable=True),
    )
    op.create_index("ix_maintenance_issues_contractor_id", "maintenance_issues", ["contractor_id"])


def downgrade() -> None:
    op.drop_index("ix_maintenance_issues_contractor_id", "maintenance_issues")
    op.drop_column("maintenance_issues", "contractor_id")
    op.drop_table("contractors")
