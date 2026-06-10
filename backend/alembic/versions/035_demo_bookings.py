"""035 — Demo bookings

Revision ID: 035
Revises: 034
Create Date: 2026-06-08

Adds the demo_bookings table backing the public "Book a Demo" widget on the
marketing site, plus the notifications.demo_booking_email system setting that
controls where new-booking alerts are sent (superadmin-configurable so the
platform team can route them to e.g. support@geoboxafrica.com without a code
change).
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "035"
down_revision = "034"
branch_labels = None
depends_on = None

_SETTING_KEY = "notifications.demo_booking_email"


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    if not inspector.has_table("demo_bookings"):
        op.create_table(
            "demo_bookings",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),

            sa.Column("first_name", sa.String(100), nullable=False),
            sa.Column("last_name", sa.String(100), nullable=False),
            sa.Column("email", sa.String(255), nullable=False),
            sa.Column("phone", sa.String(50), nullable=False),

            sa.Column("company", sa.String(255), nullable=True),
            sa.Column("portfolio_size", sa.String(50), nullable=True),
            sa.Column("message", sa.Text(), nullable=True),

            sa.Column("marketing_consent", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("consent_given_at", sa.DateTime(timezone=True), nullable=True),

            sa.Column("slot_date", sa.Date(), nullable=False),
            sa.Column("slot_time", sa.Time(), nullable=False),
            sa.Column("timezone", sa.String(50), nullable=False, server_default="Africa/Kampala"),

            sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        )
        op.create_index("ix_demo_bookings_email", "demo_bookings", ["email"])
        op.create_index("ix_demo_bookings_slot_date", "demo_bookings", ["slot_date"])
        op.create_index("ix_demo_bookings_status", "demo_bookings", ["status"])
        op.create_unique_constraint(
            "uq_demo_bookings_slot", "demo_bookings", ["slot_date", "slot_time"],
        )

    op.execute(
        sa.text(
            "INSERT INTO system_settings"
            " (key, value, category, label, description, value_type, is_secret, is_required)"
            " VALUES (:key, :value, :category, :label, :description, :value_type, :is_secret, :is_required)"
            " ON CONFLICT (key) DO NOTHING"
        ).bindparams(
            key=_SETTING_KEY,
            value="hello@crib.ug",
            category="platform",
            label="Demo Booking Notification Email",
            description=(
                "Address that receives an alert whenever someone books a product "
                "demo via the marketing site (e.g. support@geoboxafrica.com)."
            ),
            value_type="string",
            is_secret=False,
            is_required=False,
        )
    )


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM system_settings WHERE key = :key").bindparams(key=_SETTING_KEY))
    op.drop_constraint("uq_demo_bookings_slot", "demo_bookings", type_="unique")
    op.drop_index("ix_demo_bookings_status", table_name="demo_bookings")
    op.drop_index("ix_demo_bookings_slot_date", table_name="demo_bookings")
    op.drop_index("ix_demo_bookings_email", table_name="demo_bookings")
    op.drop_table("demo_bookings")
