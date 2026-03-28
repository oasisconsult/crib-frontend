"""Expand tenants table + add tenant_documents + tenant_invites

Revision ID: 003
Revises: 002
Create Date: 2026-03-28
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "003"
down_revision: str | None = "002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── New enum types ─────────────────────────────────────────────────────────
    op.execute("DO $$ BEGIN CREATE TYPE tenant_status_enum AS ENUM ('active', 'inactive', 'blacklisted'); EXCEPTION WHEN duplicate_object THEN null; END $$")
    op.execute("DO $$ BEGIN CREATE TYPE onboarding_state_enum AS ENUM ('invited', 'started', 'submitted', 'approved', 'activated', 'rejected'); EXCEPTION WHEN duplicate_object THEN null; END $$")
    op.execute("DO $$ BEGIN CREATE TYPE id_document_type_enum AS ENUM ('passport', 'national_id', 'driving_licence', 'residence_permit', 'proof_of_income', 'reference_letter', 'bank_statement', 'other'); EXCEPTION WHEN duplicate_object THEN null; END $$")
    op.execute("DO $$ BEGIN CREATE TYPE invite_status_enum AS ENUM ('pending', 'accepted', 'expired'); EXCEPTION WHEN duplicate_object THEN null; END $$")

    # ── Expand tenants table (was a stub with only id + org_id + timestamps) ──
    op.add_column("tenants", sa.Column("logto_user_id", sa.String(100), nullable=True))
    op.add_column("tenants", sa.Column("first_name", sa.String(100), nullable=False, server_default=""))
    op.add_column("tenants", sa.Column("last_name", sa.String(100), nullable=False, server_default=""))
    op.add_column("tenants", sa.Column("email", sa.String(255), nullable=False, server_default=""))
    op.add_column("tenants", sa.Column("phone", sa.String(50), nullable=True))
    op.add_column("tenants", sa.Column("date_of_birth", sa.String(20), nullable=True))
    op.add_column("tenants", sa.Column("nationality", sa.String(100), nullable=True))
    op.add_column("tenants", sa.Column(
        "status",
        postgresql.ENUM("active", "inactive", "blacklisted", name="tenant_status_enum", create_type=False),
        nullable=False, server_default="inactive",
    ))
    op.add_column("tenants", sa.Column(
        "onboarding_state",
        postgresql.ENUM("invited", "started", "submitted", "approved", "activated", "rejected",
                        name="onboarding_state_enum", create_type=False),
        nullable=False, server_default="invited",
    ))
    op.add_column("tenants", sa.Column("onboarding_token", sa.String(128), nullable=True))
    op.add_column("tenants", sa.Column("onboarding_completed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("tenants", sa.Column("rejection_reason", sa.Text(), nullable=True))
    op.add_column("tenants", sa.Column(
        "current_property_id",
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey("properties.id", ondelete="SET NULL"),
        nullable=True,
    ))
    op.add_column("tenants", sa.Column("current_unit_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("tenants", sa.Column("current_lease_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("tenants", sa.Column("emergency_contact", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column("tenants", sa.Column("notes", sa.Text(), nullable=True))
    op.add_column("tenants", sa.Column("tags", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="[]"))
    op.add_column("tenants", sa.Column("gdpr_consent_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("tenants", sa.Column("data_retention_until", sa.DateTime(timezone=True), nullable=True))
    op.add_column("tenants", sa.Column("anonymised_at", sa.DateTime(timezone=True), nullable=True))

    op.create_index("ix_tenants_logto_user_id", "tenants", ["logto_user_id"])
    op.create_index("ix_tenants_email", "tenants", ["email"])
    op.create_index("ix_tenants_onboarding_token", "tenants", ["onboarding_token"])
    op.create_index("ix_tenants_onboarding_state", "tenants", ["onboarding_state"])

    # ── tenant_documents ───────────────────────────────────────────────────────
    op.create_table(
        "tenant_documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("type",
                  postgresql.ENUM("passport", "national_id", "driving_licence", "residence_permit",
                                  "proof_of_income", "reference_letter", "bank_statement", "other",
                                  name="id_document_type_enum", create_type=False),
                  nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("url", sa.String(1024), nullable=False),
        sa.Column("mime_type", sa.String(100), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("verified", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
    )
    op.create_index("ix_tenant_documents_tenant_id", "tenant_documents", ["tenant_id"])

    # ── tenant_invites ─────────────────────────────────────────────────────────
    op.create_table(
        "tenant_invites",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("organisation_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("property_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("properties.id", ondelete="SET NULL"), nullable=True),
        sa.Column("unit_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("token", sa.String(128), unique=True, nullable=False),
        sa.Column("status",
                  postgresql.ENUM("pending", "accepted", "expired",
                                  name="invite_status_enum", create_type=False),
                  nullable=False, server_default="pending"),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
    )
    op.create_index("ix_tenant_invites_token", "tenant_invites", ["token"], unique=True)
    op.create_index("ix_tenant_invites_tenant_id", "tenant_invites", ["tenant_id"])

    # ── updated_at triggers ───────────────────────────────────────────────────
    for table in ("tenant_documents", "tenant_invites"):
        op.execute(f"""
            CREATE TRIGGER trg_{table}_updated_at
            BEFORE UPDATE ON {table}
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        """)


def downgrade() -> None:
    for table in ("tenant_documents", "tenant_invites"):
        op.execute(f"DROP TRIGGER IF EXISTS trg_{table}_updated_at ON {table}")

    op.drop_table("tenant_invites")
    op.drop_table("tenant_documents")

    for col in [
        "logto_user_id", "first_name", "last_name", "email", "phone",
        "date_of_birth", "nationality", "status", "onboarding_state",
        "onboarding_token", "onboarding_completed_at", "rejection_reason",
        "current_property_id", "current_unit_id", "current_lease_id",
        "emergency_contact", "notes", "tags",
        "gdpr_consent_at", "data_retention_until", "anonymised_at",
    ]:
        op.drop_column("tenants", col)

    op.execute("DROP TYPE IF EXISTS invite_status_enum")
    op.execute("DROP TYPE IF EXISTS id_document_type_enum")
    op.execute("DROP TYPE IF EXISTS onboarding_state_enum")
    op.execute("DROP TYPE IF EXISTS tenant_status_enum")
