"""
033 — Payment reject / cancel

Adds two new terminal states to the payment_status_enum:
  rejected  — org staff (owner / caretaker / manager / superadmin) declined the payment
  cancelled — tenant withdrew the payment before it was confirmed

New columns on `payments`:
  rejection_reason       TEXT      — human-readable reason provided at rejection
  rejected_at            TIMESTAMPTZ — when the rejection was stamped
  rejected_by_profile_id UUID FK → profiles — who rejected it (for audit trail)
  cancellation_reason    TEXT      — optional reason provided by tenant at cancellation
  cancelled_at           TIMESTAMPTZ — when the cancellation was stamped

Revision ID: 033
Revises: 032
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "033"
down_revision = "032"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Extend the payment_status_enum ────────────────────────────────────────
    # PostgreSQL requires ALTER TYPE … ADD VALUE to run outside a transaction
    # when native enums are used with native_enum=True.
    op.execute("ALTER TYPE payment_status_enum ADD VALUE IF NOT EXISTS 'rejected'")
    op.execute("ALTER TYPE payment_status_enum ADD VALUE IF NOT EXISTS 'cancelled'")

    # ── Rejection audit columns ───────────────────────────────────────────────
    op.add_column(
        "payments",
        sa.Column("rejection_reason", sa.Text(), nullable=True),
    )
    op.add_column(
        "payments",
        sa.Column("rejected_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "payments",
        sa.Column(
            "rejected_by_profile_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("profiles.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_payments_rejected_by_profile_id",
        "payments",
        ["rejected_by_profile_id"],
    )

    # ── Cancellation audit columns ────────────────────────────────────────────
    op.add_column(
        "payments",
        sa.Column("cancellation_reason", sa.Text(), nullable=True),
    )
    op.add_column(
        "payments",
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    # Note: PostgreSQL cannot remove enum values; downgrade removes columns only.
    op.drop_column("payments", "cancelled_at")
    op.drop_column("payments", "cancellation_reason")
    op.drop_index("ix_payments_rejected_by_profile_id", table_name="payments")
    op.drop_column("payments", "rejected_by_profile_id")
    op.drop_column("payments", "rejected_at")
    op.drop_column("payments", "rejection_reason")
