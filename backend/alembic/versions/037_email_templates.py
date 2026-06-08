"""037 — Email templates

Revision ID: 037
Revises: 036
Create Date: 2026-06-08

Adds the email_templates table — a fixed, slug-keyed registry of superadmin-
editable transactional email templates. Seeded with the 5 demo-booking
templates, ported verbatim from the hardcoded copy in demo_booking_service.py
so behaviour is unchanged immediately after this migration runs (the service
falls back to the same copy — see EMAIL_TEMPLATE_DEFAULTS — if a row is ever
missing, deactivated, or fails to render).
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

from app.models.email_template import EMAIL_TEMPLATE_DEFAULTS

revision = "037"
down_revision = "036"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "email_templates",
        sa.Column("slug", sa.String(80), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("subject", sa.String(500), nullable=False, server_default=""),
        sa.Column("html_body", sa.Text(), nullable=False, server_default=""),
        sa.Column("text_body", sa.Text(), nullable=False, server_default=""),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("updated_by", sa.String(100), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    table = sa.table(
        "email_templates",
        sa.column("slug"),
        sa.column("name"),
        sa.column("description"),
        sa.column("subject"),
        sa.column("html_body"),
        sa.column("text_body"),
    )
    op.bulk_insert(table, [
        {
            "slug": row["slug"],
            "name": row["name"],
            "description": row["description"],
            "subject": row["subject"],
            "html_body": row["html_body"],
            "text_body": row["text_body"],
        }
        for row in EMAIL_TEMPLATE_DEFAULTS
    ])


def downgrade() -> None:
    op.drop_table("email_templates")
