"""Pricing v2: competitive rates, updated limits, feature flags, exchange rate seed.

Revision ID: 065
Revises: 064
Create Date: 2026-06-19

Changes:
  subscription_plans — new prices, limits, and extended feature flags JSONB
  system_settings    — seed platform.ugx_usd_rate and platform.ugx_usd_rate_updated
"""
import sqlalchemy as sa
from alembic import op

revision = "065"
down_revision = "064"
branch_labels = None
depends_on = None


# ── New plan data ─────────────────────────────────────────────────────────────
# Annual UGX = monthly * 12 * 0.8 (20% discount)
# Annual USD  = monthly_cents * 12 * 0.8

PLAN_UPDATES = [
    {
        "slug": "free",
        "max_properties": 2,
        "max_units": 15,
        "max_users": 1,
        "max_storage_mb": 100,
        "monthly_price_ugx": 0,
        "annual_price_ugx": 0,
        "monthly_price_usd_cents": 0,
        "annual_price_usd_cents": 0,
        "features": {
            "analytics_basic": True,
            "analytics_advanced": False,
            "maintenance_workflows": False,
            "document_storage": False,
            "tenant_messaging": False,
            "team_members": False,
            "inspection_reports": False,
            "esignature_enabled": False,
            "onboarding_enabled": False,
            "efris": False,
            "screenings": False,
            "api_access": False,
            "custom_branding": False,
            "priority_support": False,
            "dedicated_support": False,
            "sso": False,
            "audit_logs": False,
        },
        "description": "Get started with basic property management. No credit card required.",
    },
    {
        "slug": "professional",
        "max_properties": 20,
        "max_units": 100,
        "max_users": 5,
        "max_storage_mb": 10240,
        "monthly_price_ugx": 159_000,
        "annual_price_ugx": 1_526_400,    # 159000 * 12 * 0.8
        "monthly_price_usd_cents": 4_500,
        "annual_price_usd_cents": 43_200,  # 45 * 12 * 0.8 * 100
        "features": {
            "analytics_basic": True,
            "analytics_advanced": True,
            "maintenance_workflows": True,
            "document_storage": True,
            "tenant_messaging": True,
            "team_members": True,
            "inspection_reports": True,
            "esignature_enabled": True,
            "onboarding_enabled": True,
            "efris": False,
            "screenings": True,
            "api_access": False,
            "custom_branding": False,
            "priority_support": False,
            "dedicated_support": False,
            "sso": False,
            "audit_logs": False,
        },
        "description": "For growing landlords who need advanced tools.",
    },
    {
        "slug": "agency",
        "max_properties": -1,
        "max_units": 500,
        "max_users": 20,
        "max_storage_mb": 51200,
        "monthly_price_ugx": 399_000,
        "annual_price_ugx": 3_830_400,     # 399000 * 12 * 0.8
        "monthly_price_usd_cents": 10_900,
        "annual_price_usd_cents": 104_640,  # 109 * 12 * 0.8 * 100
        "features": {
            "analytics_basic": True,
            "analytics_advanced": True,
            "maintenance_workflows": True,
            "document_storage": True,
            "tenant_messaging": True,
            "team_members": True,
            "inspection_reports": True,
            "esignature_enabled": True,
            "onboarding_enabled": True,
            "efris": True,
            "screenings": True,
            "api_access": False,
            "custom_branding": True,
            "priority_support": True,
            "dedicated_support": False,
            "sso": False,
            "audit_logs": True,
        },
        "description": "For property management agencies with multiple landlords and clients.",
    },
    {
        "slug": "enterprise",
        "max_properties": -1,
        "max_units": -1,
        "max_users": -1,
        "max_storage_mb": -1,
        "monthly_price_ugx": 0,   # custom quote — price is negotiated
        "annual_price_ugx": 0,
        "monthly_price_usd_cents": 0,
        "annual_price_usd_cents": 0,
        "features": {
            "analytics_basic": True,
            "analytics_advanced": True,
            "maintenance_workflows": True,
            "document_storage": True,
            "tenant_messaging": True,
            "team_members": True,
            "inspection_reports": True,
            "esignature_enabled": True,
            "onboarding_enabled": True,
            "efris": True,
            "screenings": True,
            "api_access": True,
            "custom_branding": True,
            "priority_support": True,
            "dedicated_support": True,
            "sso": True,
            "audit_logs": True,
        },
        "description": "Unlimited scale with dedicated infrastructure and support.",
    },
]

# ── Exchange rate seed settings ───────────────────────────────────────────────
EXCHANGE_RATE_SETTINGS = [
    (
        "platform.ugx_usd_rate",
        "3700",
        "platform",
        "UGX/USD Exchange Rate",
        "Current UGX units per 1 USD. Updated daily by the exchange rate task "
        "or manually via the 'Refresh Now' button. Used for display-only currency "
        "conversion on the pricing page; prices are stored natively in both currencies.",
        "integer",
        False,
        False,
    ),
    (
        "platform.ugx_usd_rate_updated",
        "",
        "platform",
        "Exchange Rate Last Updated",
        "ISO 8601 timestamp of the last successful rate fetch from Frankfurter. "
        "Empty means the rate has not been refreshed since the initial seed.",
        "string",
        False,
        False,
    ),
]


def upgrade() -> None:
    conn = op.get_bind()
    import json

    for plan in PLAN_UPDATES:
        conn.execute(
            sa.text("""
                UPDATE subscription_plans SET
                    max_properties        = :max_properties,
                    max_units             = :max_units,
                    max_users             = :max_users,
                    max_storage_mb        = :max_storage_mb,
                    monthly_price_ugx     = :monthly_price_ugx,
                    annual_price_ugx      = :annual_price_ugx,
                    monthly_price_usd_cents = :monthly_price_usd_cents,
                    annual_price_usd_cents  = :annual_price_usd_cents,
                    features              = :features,
                    description           = :description
                WHERE slug = :slug
            """),
            {
                "slug": plan["slug"],
                "max_properties": plan["max_properties"],
                "max_units": plan["max_units"],
                "max_users": plan["max_users"],
                "max_storage_mb": plan["max_storage_mb"],
                "monthly_price_ugx": plan["monthly_price_ugx"],
                "annual_price_ugx": plan["annual_price_ugx"],
                "monthly_price_usd_cents": plan["monthly_price_usd_cents"],
                "annual_price_usd_cents": plan["annual_price_usd_cents"],
                "features": json.dumps(plan["features"]),
                "description": plan["description"],
            },
        )

    # Seed exchange rate settings (INSERT ... ON CONFLICT DO NOTHING so
    # re-running the migration is safe if the keys already exist)
    for (key, value, category, label, description, value_type, is_secret, is_required) in EXCHANGE_RATE_SETTINGS:
        conn.execute(
            sa.text("""
                INSERT INTO system_settings
                    (key, value, category, label, description, value_type, is_secret, is_required)
                VALUES
                    (:key, :value, :category, :label, :description, :value_type, :is_secret, :is_required)
                ON CONFLICT (key) DO NOTHING
            """),
            {
                "key": key,
                "value": value,
                "category": category,
                "label": label,
                "description": description,
                "value_type": value_type,
                "is_secret": is_secret,
                "is_required": is_required,
            },
        )


def downgrade() -> None:
    conn = op.get_bind()
    import json

    # Restore original prices from migration 028
    originals = [
        ("free",         1,   5,   1,    100,      0,         0,       0,        0),
        ("professional", 10,  50,  3,   2048, 200_000, 1_920_000,  4_900,   47_000),
        ("agency",       50, 300, 15,  20480, 500_000, 4_800_000, 12_900,  123_800),
        ("enterprise",   -1,  -1, -1,     -1, 1_000_000, 9_600_000, 25_900, 248_600),
    ]
    for (slug, mp, mu, muser, mstor, mo_ugx, an_ugx, mo_usd, an_usd) in originals:
        conn.execute(
            sa.text("""
                UPDATE subscription_plans SET
                    max_properties = :mp, max_units = :mu, max_users = :muser,
                    max_storage_mb = :mstor,
                    monthly_price_ugx = :mo_ugx, annual_price_ugx = :an_ugx,
                    monthly_price_usd_cents = :mo_usd, annual_price_usd_cents = :an_usd
                WHERE slug = :slug
            """),
            {"slug": slug, "mp": mp, "mu": mu, "muser": muser, "mstor": mstor,
             "mo_ugx": mo_ugx, "an_ugx": an_ugx, "mo_usd": mo_usd, "an_usd": an_usd},
        )

    conn.execute(
        sa.text("DELETE FROM system_settings WHERE key IN ('platform.ugx_usd_rate', 'platform.ugx_usd_rate_updated')")
    )
