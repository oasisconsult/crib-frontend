"""044 — add receipt_url to payments

Revision ID: 044
Revises: 043
Create Date: 2026-06-10

Adds receipt_url (nullable Text) to the payments table so tenants can
attach a photo or document of their bank transfer / cash payment slip.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "044"
down_revision = "043"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("payments", sa.Column("receipt_url", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("payments", "receipt_url")
