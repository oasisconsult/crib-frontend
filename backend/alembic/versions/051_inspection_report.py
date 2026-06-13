"""Add report signing fields to inspections table

Revision ID: 051
Revises: 050
Create Date: 2026-06-13
"""

from alembic import op
import sqlalchemy as sa

revision = "051"
down_revision = "050"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("inspections", sa.Column("sign_token", sa.String(128), nullable=True))
    op.add_column("inspections", sa.Column("sign_token_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("inspections", sa.Column("landlord_signed_by", sa.String(255), nullable=True))
    op.add_column("inspections", sa.Column("report_pdf_url", sa.String(500), nullable=True))
    op.create_index("ix_inspections_sign_token", "inspections", ["sign_token"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_inspections_sign_token", table_name="inspections")
    op.drop_column("inspections", "report_pdf_url")
    op.drop_column("inspections", "landlord_signed_by")
    op.drop_column("inspections", "sign_token_expires_at")
    op.drop_column("inspections", "sign_token")
