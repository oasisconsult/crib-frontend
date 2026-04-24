"""024 — Add paper_agreement_acknowledged to leases

Revision ID: 024
Revises: 023
Create Date: 2026-04-24

Adds a boolean flag so managers can record that a signed paper copy of a
tenancy agreement is on file for CSV-imported (or any offline) leases.
"""
from __future__ import annotations
from collections.abc import Sequence
from alembic import op
import sqlalchemy as sa

revision: str = "024"
down_revision: str | None = "023"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "leases",
        sa.Column(
            "paper_agreement_acknowledged",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("leases", "paper_agreement_acknowledged")
