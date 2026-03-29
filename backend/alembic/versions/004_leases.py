"""Add leases table

Revision ID: 004
Revises: 003
Create Date: 2026-03-29
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "004"
down_revision: str | None = "003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── Enum type ──────────────────────────────────────────────────────────────
    op.execute(
        "DO $$ BEGIN "
        "CREATE TYPE lease_status_enum AS ENUM ('draft', 'active', 'expired', 'terminated'); "
        "EXCEPTION WHEN duplicate_object THEN null; END $$"
    )

    # ── leases table ──────────────────────────────────────────────────────────
    op.create_table(
        "leases",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        # ── Organisation / unit / tenant scope ──────────────────────────────
        sa.Column(
            "organisation_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organisations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "property_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("properties.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "unit_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("units.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="SET NULL"),
            nullable=True,
        ),
        # ── Status ─────────────────────────────────────────────────────────
        sa.Column(
            "status",
            postgresql.ENUM(
                "draft", "active", "expired", "terminated",
                name="lease_status_enum",
                create_type=False,
            ),
            nullable=False,
            server_default="draft",
        ),
        # ── Terms (locked at draft creation) ───────────────────────────────
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),           # NULL = rolling
        sa.Column("monthly_rent", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="UGX"),
        sa.Column("deposit_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("deposit_paid", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("deposit_paid_at", sa.DateTime(timezone=True), nullable=True),
        # ── Billing rules (copied from effective unit/property rules) ───────
        sa.Column("rent_day_of_month", sa.SmallInteger(), nullable=False, server_default="1"),
        sa.Column("grace_period_days", sa.SmallInteger(), nullable=False, server_default="5"),
        sa.Column("late_fee_type", sa.String(20), nullable=False, server_default="flat"),
        sa.Column("late_fee_value", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("notice_period_days", sa.SmallInteger(), nullable=False, server_default="30"),
        # ── Lifecycle metadata ──────────────────────────────────────────────
        sa.Column("signed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notice_given_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("terminated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("termination_reason", sa.Text(), nullable=True),
        # ── Renewal chain ───────────────────────────────────────────────────
        sa.Column(
            "renewal_of_lease_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("leases.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        # ── Timestamps ─────────────────────────────────────────────────────
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

    # ── Indexes ────────────────────────────────────────────────────────────────
    op.create_index("ix_leases_organisation_id", "leases", ["organisation_id"])
    op.create_index("ix_leases_unit_id",         "leases", ["unit_id"])
    op.create_index("ix_leases_tenant_id",        "leases", ["tenant_id"])
    op.create_index("ix_leases_status",           "leases", ["status"])

    # ── updated_at trigger ─────────────────────────────────────────────────────
    op.execute("""
        CREATE TRIGGER trg_leases_updated_at
        BEFORE UPDATE ON leases
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_leases_updated_at ON leases")
    op.drop_table("leases")
    op.execute("DROP TYPE IF EXISTS lease_status_enum")
