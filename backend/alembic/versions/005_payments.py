"""Add payments domain: rent_schedules, payments, late_fees, deposits

Revision ID: 005
Revises: 004
Create Date: 2026-03-29
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "005"
down_revision: str | None = "004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── Enum types ─────────────────────────────────────────────────────────────
    for stmt in [
        "DO $$ BEGIN CREATE TYPE rent_schedule_status_enum AS ENUM "
        "('pending','paid','overdue','waived'); "
        "EXCEPTION WHEN duplicate_object THEN null; END $$",

        "DO $$ BEGIN CREATE TYPE payment_category_enum AS ENUM "
        "('rent','deposit','late_fee','other'); "
        "EXCEPTION WHEN duplicate_object THEN null; END $$",

        "DO $$ BEGIN CREATE TYPE payment_method_enum AS ENUM "
        "('cash','bank_transfer','mobile_money_mtn','mobile_money_airtel','other'); "
        "EXCEPTION WHEN duplicate_object THEN null; END $$",

        "DO $$ BEGIN CREATE TYPE payment_status_enum AS ENUM "
        "('pending','confirmed','failed','refunded'); "
        "EXCEPTION WHEN duplicate_object THEN null; END $$",

        "DO $$ BEGIN CREATE TYPE deposit_status_enum AS ENUM "
        "('held','partially_returned','fully_returned','forfeited'); "
        "EXCEPTION WHEN duplicate_object THEN null; END $$",
    ]:
        op.execute(stmt)

    # ── rent_schedules ─────────────────────────────────────────────────────────
    op.create_table(
        "rent_schedules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("organisation_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("lease_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("leases.id", ondelete="CASCADE"), nullable=False),
        # Period
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        # Amounts
        sa.Column("amount_due", sa.Numeric(12, 2), nullable=False),
        sa.Column("amount_paid", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("late_fee_applied", sa.Numeric(12, 2), nullable=False, server_default="0"),
        # State
        sa.Column("status", postgresql.ENUM(
            "pending", "paid", "overdue", "waived",
            name="rent_schedule_status_enum", create_type=False,
        ), nullable=False, server_default="pending"),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        # Timestamps
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
    )
    op.create_index("ix_rent_schedules_organisation_id", "rent_schedules", ["organisation_id"])
    op.create_index("ix_rent_schedules_lease_id", "rent_schedules", ["lease_id"])
    op.create_index("ix_rent_schedules_status", "rent_schedules", ["status"])
    op.create_index("ix_rent_schedules_due_date", "rent_schedules", ["due_date"])
    op.execute("""
        CREATE TRIGGER trg_rent_schedules_updated_at
        BEFORE UPDATE ON rent_schedules
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    """)

    # ── payments ───────────────────────────────────────────────────────────────
    op.create_table(
        "payments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("organisation_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("lease_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("leases.id", ondelete="CASCADE"), nullable=False),
        sa.Column("rent_schedule_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("rent_schedules.id", ondelete="SET NULL"), nullable=True),
        # Payment details
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="UGX"),
        sa.Column("category", postgresql.ENUM(
            "rent", "deposit", "late_fee", "other",
            name="payment_category_enum", create_type=False,
        ), nullable=False, server_default="rent"),
        sa.Column("method", postgresql.ENUM(
            "cash", "bank_transfer", "mobile_money_mtn", "mobile_money_airtel", "other",
            name="payment_method_enum", create_type=False,
        ), nullable=False, server_default="cash"),
        sa.Column("reference", sa.Text(), nullable=True),
        sa.Column("idempotency_key", sa.String(255), nullable=True, unique=True),
        # State
        sa.Column("status", postgresql.ENUM(
            "pending", "confirmed", "failed", "refunded",
            name="payment_status_enum", create_type=False,
        ), nullable=False, server_default="pending"),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        # Timestamps
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
    )
    op.create_index("ix_payments_organisation_id", "payments", ["organisation_id"])
    op.create_index("ix_payments_lease_id", "payments", ["lease_id"])
    op.create_index("ix_payments_rent_schedule_id", "payments", ["rent_schedule_id"])
    op.create_index("ix_payments_status", "payments", ["status"])
    op.execute("""
        CREATE TRIGGER trg_payments_updated_at
        BEFORE UPDATE ON payments
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    """)

    # ── late_fees ──────────────────────────────────────────────────────────────
    op.create_table(
        "late_fees",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("organisation_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("lease_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("leases.id", ondelete="CASCADE"), nullable=False),
        sa.Column("rent_schedule_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("rent_schedules.id", ondelete="CASCADE"),
                  nullable=False, unique=True),  # one fee per schedule
        sa.Column("fee_type", sa.String(20), nullable=False),   # flat | percent
        sa.Column("calculated_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("applied_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("waived", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("waived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("waived_reason", sa.Text(), nullable=True),
        # Timestamps
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
    )
    op.create_index("ix_late_fees_organisation_id", "late_fees", ["organisation_id"])
    op.create_index("ix_late_fees_lease_id", "late_fees", ["lease_id"])
    op.execute("""
        CREATE TRIGGER trg_late_fees_updated_at
        BEFORE UPDATE ON late_fees
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    """)

    # ── deposits ───────────────────────────────────────────────────────────────
    op.create_table(
        "deposits",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("organisation_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("lease_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("leases.id", ondelete="CASCADE"),
                  nullable=False, unique=True),  # one deposit per lease
        sa.Column("amount_held", sa.Numeric(12, 2), nullable=False),
        sa.Column("amount_returned", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("deductions", postgresql.JSONB(), nullable=False, server_default="'[]'"),
        sa.Column("status", postgresql.ENUM(
            "held", "partially_returned", "fully_returned", "forfeited",
            name="deposit_status_enum", create_type=False,
        ), nullable=False, server_default="held"),
        sa.Column("returned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        # Timestamps
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
    )
    op.create_index("ix_deposits_organisation_id", "deposits", ["organisation_id"])
    op.execute("""
        CREATE TRIGGER trg_deposits_updated_at
        BEFORE UPDATE ON deposits
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    """)


def downgrade() -> None:
    for table in ["deposits", "late_fees", "payments", "rent_schedules"]:
        op.execute(f"DROP TRIGGER IF EXISTS trg_{table}_updated_at ON {table}")
    op.drop_table("deposits")
    op.drop_table("late_fees")
    op.drop_table("payments")
    op.drop_table("rent_schedules")
    for t in ["deposit_status_enum", "payment_status_enum", "payment_method_enum",
              "payment_category_enum", "rent_schedule_status_enum"]:
        op.execute(f"DROP TYPE IF EXISTS {t}")
