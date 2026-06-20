"""change inspections.property_id FK from CASCADE to RESTRICT

Revision ID: 069
Revises: 068
Create Date: 2026-06-20

Properties are soft-deleted (deleted_at), so the CASCADE never fires through
normal app usage. This migration tightens the constraint to RESTRICT as a
safety net against direct SQL deletes, maintenance scripts, or future code
paths that might hard-delete a property.
"""
from alembic import op

revision = "069"
down_revision = "068"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("inspections_property_id_fkey", "inspections", type_="foreignkey")
    op.create_foreign_key(
        "inspections_property_id_fkey",
        "inspections",
        "properties",
        ["property_id"],
        ["id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    op.drop_constraint("inspections_property_id_fkey", "inspections", type_="foreignkey")
    op.create_foreign_key(
        "inspections_property_id_fkey",
        "inspections",
        "properties",
        ["property_id"],
        ["id"],
        ondelete="CASCADE",
    )
