"""
017 – Tenant contact fields, lease advance_months, agency system settings

New columns:
  tenants.whatsapp_number          VARCHAR(50)
  tenants.mobile_money_provider    VARCHAR(20)
  tenants.mobile_money_number      VARCHAR(50)
  leases.advance_months            SMALLINT (nullable)

New system_settings rows:
  agency.name, agency.contact_phone, agency.contact_email
"""

from alembic import op
import sqlalchemy as sa

revision = "017"
down_revision = "016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Tenant contact fields ─────────────────────────────────────────────────
    op.add_column("tenants", sa.Column("whatsapp_number", sa.String(50), nullable=True))
    op.add_column("tenants", sa.Column("mobile_money_provider", sa.String(20), nullable=True))
    op.add_column("tenants", sa.Column("mobile_money_number", sa.String(50), nullable=True))

    # ── Lease advance_months override ─────────────────────────────────────────
    op.add_column("leases", sa.Column("advance_months", sa.SmallInteger(), nullable=True))

    # ── Agency system settings ────────────────────────────────────────────────
    op.execute(sa.text("""
        INSERT INTO system_settings
            (key, value, category, label, description, value_type, is_secret, is_required)
        VALUES
            ('agency.name',          '', 'agency', 'Agency / Landlord Name',
             'Business name or landlord name shown on tenancy agreements.',
             'string', false, false),
            ('agency.contact_phone', '', 'agency', 'Agency Contact Phone',
             'Phone number shown on tenancy agreements (e.g. +256 700 000000).',
             'string', false, false),
            ('agency.contact_email', '', 'agency', 'Agency Contact Email',
             'Email address shown on tenancy agreements.',
             'string', false, false)
        ON CONFLICT (key) DO NOTHING
    """))


def downgrade() -> None:
    op.drop_column("tenants", "whatsapp_number")
    op.drop_column("tenants", "mobile_money_provider")
    op.drop_column("tenants", "mobile_money_number")
    op.drop_column("leases", "advance_months")
    op.execute(sa.text("""
        DELETE FROM system_settings
        WHERE key IN ('agency.name', 'agency.contact_phone', 'agency.contact_email')
    """))
