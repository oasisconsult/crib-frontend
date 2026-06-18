"""Inspector onboarding — extend contractors + inspections.

Revision ID: 063
Revises: 062
Create Date: 2026-06-18

Adds:
  contractors.is_inspector          — marks a contractor as an approved inspector
  inspections.inspector_contractor_id  — FK to the assigned external contractor-inspector
  inspections.inspector_token          — secure URL-safe token for the inspector portal
  inspections.inspector_token_expires_at
  inspections.inspector_submitted_at   — timestamp when inspector submitted findings
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "063"
down_revision = "062"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("contractors", sa.Column("is_inspector", sa.Boolean(), nullable=False, server_default="false"))

    op.add_column("inspections", sa.Column(
        "inspector_contractor_id",
        UUID(as_uuid=True),
        sa.ForeignKey("contractors.id", ondelete="SET NULL"),
        nullable=True,
    ))
    op.add_column("inspections", sa.Column("inspector_token", sa.String(128), nullable=True))
    op.add_column("inspections", sa.Column("inspector_token_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("inspections", sa.Column("inspector_submitted_at", sa.DateTime(timezone=True), nullable=True))

    op.create_index("ix_inspections_inspector_token", "inspections", ["inspector_token"], unique=True)
    op.create_index("ix_inspections_inspector_contractor", "inspections", ["inspector_contractor_id"])


def downgrade() -> None:
    op.drop_index("ix_inspections_inspector_contractor", "inspections")
    op.drop_index("ix_inspections_inspector_token", "inspections")
    op.drop_column("inspections", "inspector_submitted_at")
    op.drop_column("inspections", "inspector_token_expires_at")
    op.drop_column("inspections", "inspector_token")
    op.drop_column("inspections", "inspector_contractor_id")
    op.drop_column("contractors", "is_inspector")
