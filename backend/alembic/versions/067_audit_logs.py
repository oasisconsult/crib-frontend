"""Create general-purpose audit_logs table.

Revision ID: 067
Revises: 066
Create Date: 2026-06-19
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "067"
down_revision = "066"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "audit_logs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organisation_id", UUID(as_uuid=True),
                  sa.ForeignKey("organisations.id", ondelete="CASCADE"), nullable=True),
        sa.Column("actor_id", UUID(as_uuid=True),
                  sa.ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True),
        sa.Column("actor_role", sa.String(32), nullable=True),
        sa.Column("resource_type", sa.String(64), nullable=False),
        sa.Column("resource_id", UUID(as_uuid=True), nullable=True),
        sa.Column("resource_label", sa.String(255), nullable=True),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("changes", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("event_data", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.Text, nullable=True),
        sa.Column("request_id", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        # NO updated_at — rows are immutable
    )
    op.create_index("ix_audit_logs_org_time", "audit_logs", ["organisation_id", "created_at"])
    op.create_index("ix_audit_logs_resource", "audit_logs", ["resource_type", "resource_id"])
    op.create_index("ix_audit_logs_actor", "audit_logs", ["actor_id"])
    op.create_index("ix_audit_logs_time", "audit_logs", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_audit_logs_time", "audit_logs")
    op.drop_index("ix_audit_logs_actor", "audit_logs")
    op.drop_index("ix_audit_logs_resource", "audit_logs")
    op.drop_index("ix_audit_logs_org_time", "audit_logs")
    op.drop_table("audit_logs")
