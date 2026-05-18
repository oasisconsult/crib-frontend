"""028 — Subscription & Billing tables

Revision ID: 028
Revises: 027
Create Date: 2026-05-18

Creates:
  subscription_plans
  organisation_subscriptions
  subscription_invoices
  subscription_payments
  subscription_audit_log
"""

from __future__ import annotations

import json
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "028"
down_revision: str | None = "027"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()

    # -------------------------------------------------------------------------
    # ENUMS
    # -------------------------------------------------------------------------

    conn.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE subscription_status_enum AS ENUM (
                'trialing',
                'active',
                'pending_payment',
                'pending_verification',
                'grace_period',
                'past_due',
                'suspended',
                'cancelled',
                'expired'
            );
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
    """))

    conn.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE billing_cycle_enum AS ENUM (
                'none',
                'monthly',
                'annual'
            );
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
    """))

    conn.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE billing_currency_enum AS ENUM (
                'UGX',
                'USD'
            );
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
    """))

    conn.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE subscription_payment_method_enum AS ENUM (
                'mtn_momo',
                'airtel_money',
                'bank_transfer',
                'cash'
            );
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
    """))

    conn.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE subscription_payment_status_enum AS ENUM (
                'pending',
                'pending_verification',
                'verified',
                'rejected',
                'refunded'
            );
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
    """))

    conn.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE invoice_status_enum AS ENUM (
                'draft',
                'issued',
                'paid',
                'void',
                'overdue'
            );
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
    """))

    conn.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE subscription_event_enum AS ENUM (
                'created',
                'upgraded',
                'downgraded',
                'cancelled',
                'reinstated',
                'payment_submitted',
                'payment_verified',
                'payment_rejected',
                'suspended',
                'grace_period_started',
                'expired',
                'trial_started',
                'plan_changed'
            );
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
    """))

    # -------------------------------------------------------------------------
    # TABLES
    # -------------------------------------------------------------------------

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS subscription_plans (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            name VARCHAR(100) NOT NULL,
            slug VARCHAR(50) NOT NULL UNIQUE,
            description TEXT,

            monthly_price_ugx BIGINT NOT NULL DEFAULT 0,
            annual_price_ugx BIGINT NOT NULL DEFAULT 0,

            monthly_price_usd_cents INTEGER NOT NULL DEFAULT 0,
            annual_price_usd_cents INTEGER NOT NULL DEFAULT 0,

            max_properties INTEGER NOT NULL DEFAULT 1,
            max_units INTEGER NOT NULL DEFAULT 5,
            max_users INTEGER NOT NULL DEFAULT 1,
            max_storage_mb INTEGER NOT NULL DEFAULT 100,

            features JSONB NOT NULL DEFAULT '{}'::jsonb,

            trial_days INTEGER NOT NULL DEFAULT 0,

            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            is_publicly_visible BOOLEAN NOT NULL DEFAULT TRUE,

            display_order INTEGER NOT NULL DEFAULT 0,

            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    """))

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS organisation_subscriptions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            organisation_id UUID NOT NULL UNIQUE
                REFERENCES organisations(id)
                ON DELETE CASCADE,

            plan_id UUID NOT NULL
                REFERENCES subscription_plans(id),

            status subscription_status_enum NOT NULL DEFAULT 'active',

            billing_cycle billing_cycle_enum NOT NULL DEFAULT 'none',

            currency billing_currency_enum NOT NULL DEFAULT 'UGX',

            current_period_start TIMESTAMPTZ,
            current_period_end TIMESTAMPTZ,

            trial_ends_at TIMESTAMPTZ,
            grace_period_until TIMESTAMPTZ,

            next_invoice_date TIMESTAMPTZ,

            auto_renew BOOLEAN NOT NULL DEFAULT TRUE,

            cancelled_at TIMESTAMPTZ,
            cancellation_reason TEXT,

            price_paid BIGINT,
            price_currency VARCHAR(3),

            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    """))

    conn.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS ix_org_subscriptions_org_id
        ON organisation_subscriptions(organisation_id);
    """))

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS subscription_invoices (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            organisation_id UUID NOT NULL
                REFERENCES organisations(id)
                ON DELETE CASCADE,

            subscription_id UUID NOT NULL
                REFERENCES organisation_subscriptions(id),

            invoice_number VARCHAR(30) NOT NULL UNIQUE,

            subtotal BIGINT NOT NULL,
            tax_amount BIGINT NOT NULL DEFAULT 0,
            total BIGINT NOT NULL,

            currency VARCHAR(3) NOT NULL DEFAULT 'UGX',

            period_start TIMESTAMPTZ,
            period_end TIMESTAMPTZ,

            due_date TIMESTAMPTZ,
            paid_at TIMESTAMPTZ,

            status invoice_status_enum NOT NULL DEFAULT 'draft',

            pdf_file_key VARCHAR(500),

            line_items JSONB NOT NULL DEFAULT '[]'::jsonb,

            notes TEXT,

            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    """))

    conn.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS ix_sub_invoices_org_id
        ON subscription_invoices(organisation_id);
    """))

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS subscription_payments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            organisation_id UUID NOT NULL
                REFERENCES organisations(id)
                ON DELETE CASCADE,

            subscription_id UUID NOT NULL
                REFERENCES organisation_subscriptions(id),

            invoice_id UUID
                REFERENCES subscription_invoices(id),

            payment_method subscription_payment_method_enum NOT NULL,

            amount BIGINT NOT NULL,

            currency VARCHAR(3) NOT NULL DEFAULT 'UGX',

            transaction_reference VARCHAR(200),

            phone_number VARCHAR(20),

            account_name VARCHAR(200),

            bank_name VARCHAR(200),

            transfer_date DATE,

            proof_file_key VARCHAR(500),

            proof_uploaded_at TIMESTAMPTZ,

            status subscription_payment_status_enum
                NOT NULL DEFAULT 'pending',

            submitted_at TIMESTAMPTZ,

            verified_by_id UUID
                REFERENCES profiles(id),

            verified_at TIMESTAMPTZ,

            rejection_reason TEXT,

            notes TEXT,

            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    """))

    conn.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS ix_sub_payments_org_id
        ON subscription_payments(organisation_id);
    """))

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS subscription_audit_log (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            organisation_id UUID NOT NULL
                REFERENCES organisations(id)
                ON DELETE CASCADE,

            subscription_id UUID
                REFERENCES organisation_subscriptions(id),

            event_type subscription_event_enum NOT NULL,

            actor_id UUID
                REFERENCES profiles(id),

            from_plan_id UUID
                REFERENCES subscription_plans(id),

            to_plan_id UUID
                REFERENCES subscription_plans(id),

            metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    """))

    conn.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS ix_sub_audit_log_org_id
        ON subscription_audit_log(organisation_id);
    """))

    # -------------------------------------------------------------------------
    # SEED SUBSCRIPTION PLANS
    # -------------------------------------------------------------------------

    plans = [
        {
            "name": "Free",
            "slug": "free",
            "description": "Get started with basic property management.",
            "monthly_price_ugx": 0,
            "annual_price_ugx": 0,
            "monthly_price_usd_cents": 0,
            "annual_price_usd_cents": 0,
            "max_properties": 1,
            "max_units": 5,
            "max_users": 1,
            "max_storage_mb": 100,
            "features": {
                "analytics_basic": True,
                "analytics_advanced": False,
                "maintenance_workflows": False,
                "document_storage": False,
                "tenant_messaging": False,
                "team_members": False,
                "api_access": False,
                "custom_branding": False,
                "priority_support": False,
                "dedicated_support": False,
                "sso": False,
                "audit_logs": False,
            },
            "trial_days": 0,
            "display_order": 1,
        },
        {
            "name": "Professional",
            "slug": "professional",
            "description": "For growing landlords who need advanced tools.",
            "monthly_price_ugx": 200000,
            "annual_price_ugx": 1920000,
            "monthly_price_usd_cents": 4900,
            "annual_price_usd_cents": 47000,
            "max_properties": 10,
            "max_units": 50,
            "max_users": 3,
            "max_storage_mb": 2048,
            "features": {
                "analytics_basic": True,
                "analytics_advanced": True,
                "maintenance_workflows": True,
                "document_storage": True,
                "tenant_messaging": True,
                "team_members": False,
                "api_access": False,
                "custom_branding": False,
                "priority_support": False,
                "dedicated_support": False,
                "sso": False,
                "audit_logs": False,
            },
            "trial_days": 14,
            "display_order": 2,
        },
        {
            "name": "Agency",
            "slug": "agency",
            "description": "For property management agencies with multiple users.",
            "monthly_price_ugx": 500000,
            "annual_price_ugx": 4800000,
            "monthly_price_usd_cents": 12900,
            "annual_price_usd_cents": 123800,
            "max_properties": 50,
            "max_units": 300,
            "max_users": 15,
            "max_storage_mb": 20480,
            "features": {
                "analytics_basic": True,
                "analytics_advanced": True,
                "maintenance_workflows": True,
                "document_storage": True,
                "tenant_messaging": True,
                "team_members": True,
                "api_access": False,
                "custom_branding": True,
                "priority_support": True,
                "dedicated_support": False,
                "sso": False,
                "audit_logs": True,
            },
            "trial_days": 14,
            "display_order": 3,
        },
        {
            "name": "Enterprise",
            "slug": "enterprise",
            "description": "Unlimited scale with dedicated infrastructure and support.",
            "monthly_price_ugx": 1000000,
            "annual_price_ugx": 9600000,
            "monthly_price_usd_cents": 25900,
            "annual_price_usd_cents": 248600,
            "max_properties": -1,
            "max_units": -1,
            "max_users": -1,
            "max_storage_mb": -1,
            "features": {
                "analytics_basic": True,
                "analytics_advanced": True,
                "maintenance_workflows": True,
                "document_storage": True,
                "tenant_messaging": True,
                "team_members": True,
                "api_access": True,
                "custom_branding": True,
                "priority_support": True,
                "dedicated_support": True,
                "sso": True,
                "audit_logs": True,
            },
            "trial_days": 14,
            "display_order": 4,
        },
    ]

    for plan in plans:
        conn.execute(
            sa.text("""
                INSERT INTO subscription_plans (
                    name,
                    slug,
                    description,
                    monthly_price_ugx,
                    annual_price_ugx,
                    monthly_price_usd_cents,
                    annual_price_usd_cents,
                    max_properties,
                    max_units,
                    max_users,
                    max_storage_mb,
                    features,
                    trial_days,
                    is_active,
                    is_publicly_visible,
                    display_order
                )
                VALUES (
                    :name,
                    :slug,
                    :description,
                    :monthly_price_ugx,
                    :annual_price_ugx,
                    :monthly_price_usd_cents,
                    :annual_price_usd_cents,
                    :max_properties,
                    :max_units,
                    :max_users,
                    :max_storage_mb,
                    CAST(:features AS JSONB),
                    :trial_days,
                    true,
                    true,
                    :display_order
                )
                ON CONFLICT (slug) DO NOTHING;
            """),
            {
                **plan,
                "features": json.dumps(plan["features"]),
            }
        )

    # -------------------------------------------------------------------------
    # SEED SETTINGS
    # -------------------------------------------------------------------------

    settings = [
        ("billing.vat_rate_percent", "18", "billing", "VAT Rate (%)"),
        ("billing.trial_days", "14", "billing", "Default Trial Period"),
        ("billing.grace_period_days", "7", "billing", "Grace Period"),
        ("billing.invoice_prefix", "CR-INV", "billing", "Invoice Prefix"),
        ("billing.bank.name", "Stanbic Bank Uganda", "billing", "Bank Name"),
        ("billing.bank.account_name", "Crib Properties Ltd", "billing", "Account Name"),
        ("billing.bank.account_number", "9030005812395", "billing", "Account Number"),
        ("billing.bank.branch", "Garden City Branch", "billing", "Branch"),
        ("billing.bank.swift_code", "SBICUGKX", "billing", "SWIFT Code"),
        ("billing.mtn_momo.number", "+256770000000", "billing", "MTN Number"),
        ("billing.airtel.number", "+256750000000", "billing", "Airtel Number"),
    ]

    for key, value, category, label in settings:
        conn.execute(
            sa.text("""
                INSERT INTO system_settings (
                    key,
                    value,
                    category,
                    label,
                    description,
                    value_type,
                    is_secret,
                    is_required
                )
                VALUES (
                    :key,
                    :value,
                    :category,
                    :label,
                    '',
                    'string',
                    false,
                    false
                )
                ON CONFLICT (key) DO NOTHING;
            """),
            {
                "key": key,
                "value": value,
                "category": category,
                "label": label,
            }
        )


def downgrade() -> None:
    conn = op.get_bind()

    conn.execute(sa.text("""
        DROP TABLE IF EXISTS subscription_audit_log CASCADE;
    """))

    conn.execute(sa.text("""
        DROP TABLE IF EXISTS subscription_payments CASCADE;
    """))

    conn.execute(sa.text("""
        DROP TABLE IF EXISTS subscription_invoices CASCADE;
    """))

    conn.execute(sa.text("""
        DROP TABLE IF EXISTS organisation_subscriptions CASCADE;
    """))

    conn.execute(sa.text("""
        DROP TABLE IF EXISTS subscription_plans CASCADE;
    """))

    conn.execute(sa.text("""
        DELETE FROM system_settings
        WHERE category = 'billing';
    """))

    enum_types = [
        "subscription_event_enum",
        "invoice_status_enum",
        "subscription_payment_status_enum",
        "subscription_payment_method_enum",
        "billing_currency_enum",
        "billing_cycle_enum",
        "subscription_status_enum",
    ]

    for enum_type in enum_types:
        conn.execute(sa.text(f"""
            DROP TYPE IF EXISTS {enum_type} CASCADE;
        """))