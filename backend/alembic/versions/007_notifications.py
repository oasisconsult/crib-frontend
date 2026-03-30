"""Add notification_templates and notifications tables

Revision ID: 007
Revises: 006
Create Date: 2026-03-29
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "007"
down_revision: str | None = "006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── Enum types ─────────────────────────────────────────────────────────────
    for stmt in [
        "DO $$ BEGIN CREATE TYPE notification_channel_enum AS ENUM "
        "('whatsapp','email','sms','in_app'); "
        "EXCEPTION WHEN duplicate_object THEN null; END $$",

        "DO $$ BEGIN CREATE TYPE notification_trigger_enum AS ENUM "
        "('rent_due','rent_overdue','lease_expiry','lease_activated',"
        "'onboarding_invite','document_ready','inspection_scheduled',"
        "'maintenance_update','payment_confirmed','payment_failed',"
        "'late_fee_applied','deposit_received','custom'); "
        "EXCEPTION WHEN duplicate_object THEN null; END $$",

        "DO $$ BEGIN CREATE TYPE notification_state_enum AS ENUM "
        "('queued','sent','delivered','read','failed'); "
        "EXCEPTION WHEN duplicate_object THEN null; END $$",
    ]:
        op.execute(stmt)

    # ── notification_templates ─────────────────────────────────────────────────
    op.create_table(
        "notification_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("organisation_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("organisations.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("trigger", sa.String(30), nullable=False),
        sa.Column("channel", sa.String(20), nullable=False),
        sa.Column("subject", sa.String(500), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("variables", postgresql.JSONB(), nullable=False,
                  server_default=sa.text("'[]'")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
    )
    op.create_index("ix_notif_templates_organisation_id",
                    "notification_templates", ["organisation_id"])
    op.create_index("ix_notif_templates_trigger_channel",
                    "notification_templates", ["trigger", "channel"])

    # ── notifications ──────────────────────────────────────────────────────────
    op.create_table(
        "notifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("organisation_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("organisations.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("template_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("notification_templates.id", ondelete="SET NULL"),
                  nullable=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("profiles.id", ondelete="SET NULL"),
                  nullable=True),

        sa.Column("channel", sa.String(20), nullable=False),
        sa.Column("trigger", sa.String(30), nullable=False),

        sa.Column("recipient_name", sa.String(255), nullable=False),
        sa.Column("recipient_email", sa.String(255), nullable=True),
        sa.Column("recipient_phone", sa.String(50), nullable=True),

        sa.Column("subject", sa.String(500), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),

        sa.Column("state", sa.String(20), nullable=False, server_default="queued"),

        sa.Column("queued_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failure_reason", sa.Text(), nullable=True),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("external_message_id", sa.String(255), nullable=True),

        # Context FKs — nullable, for linking notifications to domain objects
        sa.Column("property_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("properties.id", ondelete="SET NULL"), nullable=True),
        sa.Column("lease_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("leases.id", ondelete="SET NULL"), nullable=True),
        sa.Column("payment_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("payments.id", ondelete="SET NULL"), nullable=True),

        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
    )
    op.create_index("ix_notifications_organisation_id", "notifications", ["organisation_id"])
    op.create_index("ix_notifications_state", "notifications", ["state"])
    op.create_index("ix_notifications_channel", "notifications", ["channel"])
    op.create_index("ix_notifications_queued_at", "notifications", ["queued_at"])


def downgrade() -> None:
    op.drop_table("notifications")
    op.drop_table("notification_templates")
    for enum in [
        "notification_state_enum",
        "notification_trigger_enum",
        "notification_channel_enum",
    ]:
        op.execute(f"DROP TYPE IF EXISTS {enum}")
