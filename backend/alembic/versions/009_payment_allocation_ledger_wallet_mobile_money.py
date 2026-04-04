"""Payment allocation, ledger, wallet, and mobile money tables

Revision ID: 009
Revises: 008
Create Date: 2026-04-04

New tables:
  - payment_allocations  : one-to-many Payment → RentSchedule allocation rows
  - ledger_entries       : immutable append-only audit trail per lease
  - mobile_money_transactions : raw inbound MTN / Airtel payment records
  - tenant_wallets       : one wallet per tenant, holds overpayment credit
  - wallet_transactions  : immutable history of every wallet credit/debit

Data migration:
  - Backfills one PaymentAllocation row for every confirmed Payment that
    already has a non-null rent_schedule_id (pre-allocation-layer payments).
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "009"
down_revision: str | None = "008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── payment_allocations ────────────────────────────────────────────────────
    op.create_table(
        "payment_allocations",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "payment_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("payments.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "rent_schedule_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("rent_schedules.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("amount_applied", sa.Numeric(12, 2), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_payment_allocations_payment_id", "payment_allocations", ["payment_id"])
    op.create_index("ix_payment_allocations_rent_schedule_id", "payment_allocations", ["rent_schedule_id"])
    op.execute("""
        CREATE TRIGGER trg_payment_allocations_updated_at
        BEFORE UPDATE ON payment_allocations
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    """)

    # ── ledger_entries ─────────────────────────────────────────────────────────
    op.create_table(
        "ledger_entries",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "organisation_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organisations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "lease_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("leases.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("entry_type", sa.String(10), nullable=False),   # "credit" | "debit"
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("reference_type", sa.String(50), nullable=False),
        sa.Column("reference_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("balance_after", sa.Numeric(12, 2), nullable=False),
        sa.Column("description", sa.String(255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_ledger_entries_organisation_id", "ledger_entries", ["organisation_id"])
    op.create_index("ix_ledger_entries_lease_id", "ledger_entries", ["lease_id"])
    op.create_index("ix_ledger_entries_reference_id", "ledger_entries", ["reference_id"])
    # Composite for getting the latest entry per lease (common query pattern)
    op.create_index(
        "ix_ledger_entries_lease_created",
        "ledger_entries",
        ["lease_id", "created_at"],
    )
    # Ledger is append-only — no update trigger needed; add one anyway for consistency
    op.execute("""
        CREATE TRIGGER trg_ledger_entries_updated_at
        BEFORE UPDATE ON ledger_entries
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    """)

    # ── mobile_money_transactions ──────────────────────────────────────────────
    op.create_table(
        "mobile_money_transactions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "organisation_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organisations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("provider", sa.String(20), nullable=False),        # "MTN" | "AIRTEL"
        sa.Column("external_id", sa.String(255), nullable=False, unique=True),
        sa.Column("phone_number", sa.String(20), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="UGX"),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="pending",
        ),  # pending | received | matched | unmatched | failed | expired
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "raw_payload",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
        sa.Column(
            "matched_payment_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
        sa.Column("reference_id", sa.String(255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_mobile_money_transactions_organisation_id", "mobile_money_transactions", ["organisation_id"])
    op.create_index("ix_mobile_money_transactions_provider", "mobile_money_transactions", ["provider"])
    op.create_index("ix_mobile_money_transactions_external_id", "mobile_money_transactions", ["external_id"])
    op.create_index("ix_mobile_money_transactions_phone_number", "mobile_money_transactions", ["phone_number"])
    op.create_index("ix_mobile_money_transactions_status", "mobile_money_transactions", ["status"])
    op.create_index("ix_mobile_money_transactions_matched_payment_id", "mobile_money_transactions", ["matched_payment_id"])
    op.create_index("ix_mobile_money_transactions_reference_id", "mobile_money_transactions", ["reference_id"])
    op.execute("""
        CREATE TRIGGER trg_mobile_money_transactions_updated_at
        BEFORE UPDATE ON mobile_money_transactions
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    """)

    # ── tenant_wallets ─────────────────────────────────────────────────────────
    op.create_table(
        "tenant_wallets",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "organisation_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organisations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("balance", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(3), nullable=False, server_default="UGX"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_tenant_wallets_tenant_id", "tenant_wallets", ["tenant_id"])
    op.create_index("ix_tenant_wallets_organisation_id", "tenant_wallets", ["organisation_id"])
    # Ensure balance never goes negative at the DB level
    op.execute("ALTER TABLE tenant_wallets ADD CONSTRAINT chk_wallet_balance_non_negative CHECK (balance >= 0)")
    op.execute("""
        CREATE TRIGGER trg_tenant_wallets_updated_at
        BEFORE UPDATE ON tenant_wallets
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    """)

    # ── wallet_transactions ────────────────────────────────────────────────────
    op.create_table(
        "wallet_transactions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "organisation_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organisations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("transaction_type", sa.String(10), nullable=False),  # "credit" | "debit"
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("reference_type", sa.String(50), nullable=False),
        sa.Column("reference_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("description", sa.String(255), nullable=True),
        sa.Column("balance_after", sa.Numeric(12, 2), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_wallet_transactions_tenant_id", "wallet_transactions", ["tenant_id"])
    op.create_index("ix_wallet_transactions_organisation_id", "wallet_transactions", ["organisation_id"])
    op.create_index("ix_wallet_transactions_reference_id", "wallet_transactions", ["reference_id"])
    op.execute("""
        CREATE TRIGGER trg_wallet_transactions_updated_at
        BEFORE UPDATE ON wallet_transactions
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    """)

    # ── Data migration: backfill PaymentAllocation rows ────────────────────────
    # For every confirmed Payment that was recorded before the allocation layer
    # existed (i.e. has a non-null rent_schedule_id and no allocation rows yet),
    # create one PaymentAllocation row — amount_applied = payment.amount.
    # This preserves existing payment history without double-counting.
    op.execute("""
        INSERT INTO payment_allocations (id, payment_id, rent_schedule_id, amount_applied, created_at, updated_at)
        SELECT
            gen_random_uuid(),
            p.id,
            p.rent_schedule_id,
            p.amount,
            p.created_at,
            p.updated_at
        FROM payments p
        WHERE
            p.status = 'confirmed'
            AND p.rent_schedule_id IS NOT NULL
            AND NOT EXISTS (
                SELECT 1 FROM payment_allocations pa WHERE pa.payment_id = p.id
            )
    """)


def downgrade() -> None:
    # Drop triggers first
    for table in [
        "wallet_transactions",
        "tenant_wallets",
        "mobile_money_transactions",
        "ledger_entries",
        "payment_allocations",
    ]:
        op.execute(f"DROP TRIGGER IF EXISTS trg_{table}_updated_at ON {table}")

    op.execute("ALTER TABLE tenant_wallets DROP CONSTRAINT IF EXISTS chk_wallet_balance_non_negative")

    op.drop_table("wallet_transactions")
    op.drop_table("tenant_wallets")
    op.drop_table("mobile_money_transactions")
    op.drop_table("ledger_entries")
    op.drop_table("payment_allocations")
