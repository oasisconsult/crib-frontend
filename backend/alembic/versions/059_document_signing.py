"""Add cryptographic document signing to tenancy_agreements + signing_otps table.

Revision ID: 059
Revises: 058
Create Date: 2026-06-17

Adds DocuSign-grade verification fields to tenancy_agreements:
  - document_hash      SHA-256 of rendered_html at the moment of tenant signing
  - signing_events     JSONB append-only audit log (OTP sent/verified, signed, sealed)
  - sealed_pdf_url     S3/MinIO URL of the certificate PDF once both parties have signed

Creates signing_otps table for email-OTP verification gate at tenant signing time.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "059"
down_revision = "058"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── tenancy_agreements — new signing evidence columns ─────────────────────
    op.add_column(
        "tenancy_agreements",
        sa.Column("document_hash", sa.String(64), nullable=True,
                  comment="SHA-256 hex of rendered_html at tenant signing time"),
    )
    op.add_column(
        "tenancy_agreements",
        sa.Column("signing_events", JSONB, nullable=True,
                  comment="Append-only audit log: [{event,actor,ip,timestamp,...}]"),
    )
    op.add_column(
        "tenancy_agreements",
        sa.Column("sealed_pdf_url", sa.Text, nullable=True,
                  comment="S3/MinIO URL of the sealed certificate PDF"),
    )

    # ── signing_otps — email OTP records ──────────────────────────────────────
    op.create_table(
        "signing_otps",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("lease_id", sa.UUID(as_uuid=True),
                  sa.ForeignKey("leases.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("code_hash", sa.String(64), nullable=False,
                  comment="SHA-256 hex of the 6-digit code"),
        sa.Column("purpose", sa.String(50), nullable=False,
                  comment="tenant_sign | countersign"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
    )
    op.create_index("ix_signing_otps_lease_id", "signing_otps", ["lease_id"])


def downgrade() -> None:
    op.drop_index("ix_signing_otps_lease_id", table_name="signing_otps")
    op.drop_table("signing_otps")
    op.drop_column("tenancy_agreements", "sealed_pdf_url")
    op.drop_column("tenancy_agreements", "signing_events")
    op.drop_column("tenancy_agreements", "document_hash")
