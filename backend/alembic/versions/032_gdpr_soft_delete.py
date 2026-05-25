"""032 — GDPR: soft-delete columns + audit log

Revision ID: 032
Revises: 031
Create Date: 2026-05-25

Adds soft-delete capability to every table that currently hard-deletes rows,
and creates a gdpr_requests audit log so all data-erasure events are traceable.

Tables receiving deleted_at
---------------------------
  tenants           — tenant records must survive for financial audit; PII is
                      separately zeroed out by anonymise_tenant()
  leases            — draft leases may be removed by the owner; keeping the row
                      lets superadmin recover accidental deletes
  tenant_documents  — file is purged from object storage; DB row kept as
                      tombstone (name/url wiped by anonymise flow)
  messages          — comms log; soft-delete preserves thread continuity

gdpr_requests audit log
-----------------------
  Every call to anonymise_tenant() / anonymise_profile() writes one row here.
  Answers: who requested erasure, what was erased, when it completed.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "032"
down_revision: str | None = "031"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── Soft-delete columns ───────────────────────────────────────────────────

    for table in ("tenants", "leases", "tenant_documents", "messages"):
        op.add_column(table, sa.Column(
            "deleted_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ))
        op.create_index(f"ix_{table}_deleted_at", table, ["deleted_at"])

    # ── GDPR erasure audit log ─────────────────────────────────────────────────

    op.create_table(
        "gdpr_requests",
        sa.Column("id", UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),

        # What was erased
        sa.Column("subject_type", sa.String(50), nullable=False),   # 'tenant' | 'profile'
        sa.Column("subject_id",   UUID(as_uuid=True), nullable=False),

        # Type of operation
        sa.Column("request_type", sa.String(50), nullable=False),   # 'soft_delete' | 'anonymise'

        # Who triggered it (NULL if triggered by an automated retention job)
        sa.Column("requested_by_profile_id", UUID(as_uuid=True),
                  sa.ForeignKey("profiles.id", ondelete="SET NULL"),
                  nullable=True),

        # Timing
        sa.Column("requested_at",  sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
        sa.Column("completed_at",  sa.DateTime(timezone=True), nullable=True),

        # Audit detail
        sa.Column("fields_cleared", JSONB,
                  server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("notes", sa.Text, nullable=True),
    )
    op.create_index(
        "ix_gdpr_requests_subject",
        "gdpr_requests",
        ["subject_type", "subject_id"],
    )
    op.create_index(
        "ix_gdpr_requests_requested_at",
        "gdpr_requests",
        ["requested_at"],
    )


def downgrade() -> None:
    op.drop_table("gdpr_requests")

    for table in ("messages", "tenant_documents", "leases", "tenants"):
        op.drop_index(f"ix_{table}_deleted_at", table_name=table)
        op.drop_column(table, "deleted_at")
