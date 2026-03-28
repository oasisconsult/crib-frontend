"""Initial schema: organisations + profiles

Revision ID: 001
Revises:
Create Date: 2026-03-28
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── Enable pgcrypto for gen_random_uuid() ────────────────────────────────
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    # ── plan_enum ─────────────────────────────────────────────────────────────
    op.execute("CREATE TYPE plan_enum AS ENUM ('starter', 'growth', 'enterprise')")

    # ── role_enum ─────────────────────────────────────────────────────────────
    op.execute("CREATE TYPE role_enum AS ENUM ('owner', 'manager', 'tenant', 'maintenance')")

    # ── organisations ─────────────────────────────────────────────────────────
    op.create_table(
        "organisations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("logto_org_id", sa.String(100), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("plan", sa.Enum("starter", "growth", "enterprise",
                                  name="plan_enum", create_type=False), nullable=False,
                  server_default="starter"),
        sa.Column("settings", postgresql.JSONB(astext_type=sa.Text()), nullable=False,
                  server_default="{}"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("billing_email", sa.String(255), nullable=True),
        sa.Column("country", sa.String(2), nullable=True),
        sa.Column("currency", sa.String(3), nullable=False, server_default="UGX"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
    )
    op.create_index("ix_organisations_logto_org_id", "organisations", ["logto_org_id"], unique=True)
    op.create_index("ix_organisations_slug", "organisations", ["slug"], unique=True)

    # ── tenants (stub — populated fully in Sprint 4) ─────────────────────────
    # We create a minimal tenants table now so Profile's FK constraint compiles.
    op.create_table(
        "tenants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("organisation_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
    )

    # ── profiles ──────────────────────────────────────────────────────────────
    op.create_table(
        "profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("logto_sub", sa.String(100), nullable=False),
        sa.Column("logto_org_id", sa.String(100), nullable=True),
        sa.Column("organisation_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("organisations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("role", sa.Enum("owner", "manager", "tenant", "maintenance",
                                  name="role_enum", create_type=False), nullable=False,
                  server_default="tenant"),
        sa.Column("display_name", sa.String(255), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("avatar_url", sa.String(1024), nullable=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("tenants.id", ondelete="SET NULL"), nullable=True),
        sa.Column("gdpr_consent_given", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("gdpr_consent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("anonymised_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
    )
    op.create_index("ix_profiles_logto_sub", "profiles", ["logto_sub"], unique=True)
    op.create_index("ix_profiles_logto_org_id", "profiles", ["logto_org_id"])
    op.create_index("ix_profiles_organisation_id", "profiles", ["organisation_id"])
    op.create_index("ix_profiles_email", "profiles", ["email"])

    # ── updated_at trigger ────────────────────────────────────────────────────
    op.execute("""
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = now();
            RETURN NEW;
        END;
        $$ language 'plpgsql';
    """)

    for table in ("organisations", "tenants", "profiles"):
        op.execute(f"""
            CREATE TRIGGER trg_{table}_updated_at
            BEFORE UPDATE ON {table}
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        """)


def downgrade() -> None:
    for table in ("organisations", "tenants", "profiles"):
        op.execute(f"DROP TRIGGER IF EXISTS trg_{table}_updated_at ON {table}")

    op.execute("DROP FUNCTION IF EXISTS update_updated_at_column")
    op.drop_table("profiles")
    op.drop_table("tenants")
    op.drop_table("organisations")
    op.execute("DROP TYPE IF EXISTS role_enum")
    op.execute("DROP TYPE IF EXISTS plan_enum")
