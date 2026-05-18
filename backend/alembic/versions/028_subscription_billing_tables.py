"""028 — Subscription & Billing tables

Revision ID: 028
Revises: 027
Create Date: 2026-05-18

Creates:
  subscription_plans            — product catalogue
  organisation_subscriptions    — one active subscription per org
  subscription_invoices         — generated invoices
  subscription_payments         — proof-of-payment records
  subscription_audit_log        — immutable lifecycle event trail

Uses pure SQL throughout to avoid SQLAlchemy/asyncpg type-inference issues
(UUID params typed as VARCHAR, dict params rejected for JSONB, etc.).
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "028"
down_revision: str | None = "027"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()

    # ── 1. Create enum types idempotently ─────────────────────────────────────
    conn.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE subscription_status_enum AS ENUM (
                'trialing','active','pending_payment','pending_verification',
                'grace_period','past_due','suspended','cancelled','expired'
            );
        EXCEPTION WHEN duplicate_object THEN null; END $$
    """))
    conn.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE billing_cycle_enum AS ENUM ('none','monthly','annual');
        EXCEPTION WHEN duplicate_object THEN null; END $$
    """))
    conn.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE billing_currency_enum AS ENUM ('UGX','USD');
        EXCEPTION WHEN duplicate_object THEN null; END $$
    """))
    conn.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE subscription_payment_method_enum AS ENUM (
                'mtn_momo','airtel_money','bank_transfer','cash'
            );
        EXCEPTION WHEN duplicate_object THEN null; END $$
    """))
    conn.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE subscription_payment_status_enum AS ENUM (
                'pending','pending_verification','verified','rejected','refunded'
            );
        EXCEPTION WHEN duplicate_object THEN null; END $$
    """))
    conn.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE invoice_status_enum AS ENUM (
                'draft','issued','paid','void','overdue'
            );
        EXCEPTION WHEN duplicate_object THEN null; END $$
    """))
    conn.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE subscription_event_enum AS ENUM (
                'created','upgraded','downgraded','cancelled','reinstated',
                'payment_submitted','payment_verified','payment_rejected',
                'suspended','grace_period_started','expired','trial_started','plan_changed'
            );
        EXCEPTION WHEN duplicate_object THEN null; END $$
    """))

    # ── 2. Create tables ───────────────────────────────────────────────────────
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS subscription_plans (
            id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name                    VARCHAR(100) NOT NULL,
            slug                    VARCHAR(50)  NOT NULL UNIQUE,
            description             TEXT,
            monthly_price_ugx       BIGINT  NOT NULL DEFAULT 0,
            annual_price_ugx        BIGINT  NOT NULL DEFAULT 0,
            monthly_price_usd_cents INTEGER NOT NULL DEFAULT 0,
            annual_price_usd_cents  INTEGER NOT NULL DEFAULT 0,
            max_properties          INTEGER NOT NULL DEFAULT 1,
            max_units               INTEGER NOT NULL DEFAULT 5,
            max_users               INTEGER NOT NULL DEFAULT 1,
            max_storage_mb          INTEGER NOT NULL DEFAULT 100,
            features                JSONB   NOT NULL DEFAULT '{}',
            trial_days              INTEGER NOT NULL DEFAULT 0,
            is_active               BOOLEAN NOT NULL DEFAULT TRUE,
            is_publicly_visible     BOOLEAN NOT NULL DEFAULT TRUE,
            display_order           INTEGER NOT NULL DEFAULT 0,
            created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS organisation_subscriptions (
            id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            organisation_id      UUID NOT NULL UNIQUE REFERENCES organisations(id) ON DELETE CASCADE,
            plan_id              UUID NOT NULL REFERENCES subscription_plans(id),
            status               subscription_status_enum NOT NULL DEFAULT 'active',
            billing_cycle        billing_cycle_enum       NOT NULL DEFAULT 'none',
            currency             billing_currency_enum    NOT NULL DEFAULT 'UGX',
            current_period_start TIMESTAMPTZ,
            current_period_end   TIMESTAMPTZ,
            trial_ends_at        TIMESTAMPTZ,
            grace_period_until   TIMESTAMPTZ,
            next_invoice_date    TIMESTAMPTZ,
            auto_renew           BOOLEAN NOT NULL DEFAULT TRUE,
            cancelled_at         TIMESTAMPTZ,
            cancellation_reason  TEXT,
            price_paid           BIGINT,
            price_currency       VARCHAR(3),
            created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_org_subscriptions_org_id "
        "ON organisation_subscriptions(organisation_id)"
    ))

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS subscription_invoices (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
            subscription_id UUID NOT NULL REFERENCES organisation_subscriptions(id),
            invoice_number  VARCHAR(30) NOT NULL UNIQUE,
            subtotal        BIGINT NOT NULL,
            tax_amount      BIGINT NOT NULL DEFAULT 0,
            total           BIGINT NOT NULL,
            currency        VARCHAR(3) NOT NULL DEFAULT 'UGX',
            period_start    TIMESTAMPTZ,
            period_end      TIMESTAMPTZ,
            due_date        TIMESTAMPTZ,
            paid_at         TIMESTAMPTZ,
            status          invoice_status_enum NOT NULL DEFAULT 'draft',
            pdf_file_key    VARCHAR(500),
            line_items      JSONB NOT NULL DEFAULT '[]',
            notes           TEXT,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_sub_invoices_org_id "
        "ON subscription_invoices(organisation_id)"
    ))

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS subscription_payments (
            id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            organisation_id       UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
            subscription_id       UUID NOT NULL REFERENCES organisation_subscriptions(id),
            invoice_id            UUID REFERENCES subscription_invoices(id),
            payment_method        subscription_payment_method_enum  NOT NULL,
            amount                BIGINT NOT NULL,
            currency              VARCHAR(3) NOT NULL DEFAULT 'UGX',
            transaction_reference VARCHAR(200),
            phone_number          VARCHAR(20),
            account_name          VARCHAR(200),
            bank_name             VARCHAR(200),
            transfer_date         DATE,
            proof_file_key        VARCHAR(500),
            proof_uploaded_at     TIMESTAMPTZ,
            status                subscription_payment_status_enum NOT NULL DEFAULT 'pending',
            submitted_at          TIMESTAMPTZ,
            verified_by_id        UUID REFERENCES profiles(id),
            verified_at           TIMESTAMPTZ,
            rejection_reason      TEXT,
            notes                 TEXT,
            created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_sub_payments_org_id "
        "ON subscription_payments(organisation_id)"
    ))

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS subscription_audit_log (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
            subscription_id UUID REFERENCES organisation_subscriptions(id),
            event_type      subscription_event_enum NOT NULL,
            actor_id        UUID REFERENCES profiles(id),
            from_plan_id    UUID REFERENCES subscription_plans(id),
            to_plan_id      UUID REFERENCES subscription_plans(id),
            metadata        JSONB NOT NULL DEFAULT '{}',
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_sub_audit_log_org_id "
        "ON subscription_audit_log(organisation_id)"
    ))

    # ── 3. Seed subscription plans ─────────────────────────────────────────────
    plans_sql = """
        INSERT INTO subscription_plans
            (name, slug, description,
             monthly_price_ugx, annual_price_ugx,
             monthly_price_usd_cents, annual_price_usd_cents,
             max_properties, max_units, max_users, max_storage_mb,
             features, trial_days, is_active, is_publicly_visible, display_order)
        VALUES
            ('Free', 'free', 'Get started with basic property management.',
             0, 0, 0, 0, 1, 5, 1, 100,
             '{"analytics_basic":true,"analytics_advanced":false,"maintenance_workflows":false,
               "document_storage":false,"tenant_messaging":false,"team_members":false,
               "api_access":false,"custom_branding":false,"priority_support":false,
               "dedicated_support":false,"sso":false,"audit_logs":false}',
             0, true, true, 1),

            ('Professional', 'professional', 'For growing landlords who need advanced tools.',
             200000, 1920000, 4900, 47000, 10, 50, 3, 2048,
             '{"analytics_basic":true,"analytics_advanced":true,"maintenance_workflows":true,
               "document_storage":true,"tenant_messaging":true,"team_members":false,
               "api_access":false,"custom_branding":false,"priority_support":false,
               "dedicated_support":false,"sso":false,"audit_logs":false}',
             14, true, true, 2),

            ('Agency', 'agency', 'For property management agencies with multiple users.',
             500000, 4800000, 12900, 123800, 50, 300, 15, 20480,
             '{"analytics_basic":true,"analytics_advanced":true,"maintenance_workflows":true,
               "document_storage":true,"tenant_messaging":true,"team_members":true,
               "api_access":false,"custom_branding":true,"priority_support":true,
               "dedicated_support":false,"sso":false,"audit_logs":true}',
             14, true, true, 3),

            ('Enterprise', 'enterprise', 'Unlimited scale with dedicated infrastructure and support.',
             1000000, 9600000, 25900, 248600, -1, -1, -1, -1,
             '{"analytics_basic":true,"analytics_advanced":true,"maintenance_workflows":true,
               "document_storage":true,"tenant_messaging":true,"team_members":true,
               "api_access":true,"custom_branding":true,"priority_support":true,
               "dedicated_support":true,"sso":true,"audit_logs":true}',
             14, true, true, 4)

        ON CONFLICT (slug) DO NOTHING
    """
    conn.execute(sa.text(plans_sql))

    # ── 4. Seed billing system settings ───────────────────────────────────────
    settings = [
        ("billing.vat_rate_percent",    "18",                   "billing", "VAT Rate (%)"),
        ("billing.trial_days",          "14",                   "billing", "Default Trial Period (days)"),
        ("billing.grace_period_days",   "7",                    "billing", "Grace Period (days)"),
        ("billing.invoice_prefix",      "CR-INV",               "billing", "Invoice Number Prefix"),
        ("billing.bank.name",           "Stanbic Bank Uganda",  "billing", "Bank Name"),
        ("billing.bank.account_name",   "Crib Properties Ltd",  "billing", "Account Name"),
        ("billing.bank.account_number", "9030005812395",        "billing", "Account Number"),
        ("billing.bank.branch",         "Garden City Branch",   "billing", "Branch"),
        ("billing.bank.swift_code",     "SBICUGKX",             "billing", "SWIFT / BIC Code"),
        ("billing.bank.sort_code",      "",                     "billing", "Sort Code"),
        ("billing.mtn_momo.number",     "+256 77 000 0000",     "billing", "MTN MoMo Number"),
        ("billing.mtn_momo.name",       "Crib Properties Ltd",  "billing", "MTN MoMo Account Name"),
        ("billing.airtel.number",       "+256 75 000 0000",     "billing", "Airtel Money Number"),
        ("billing.airtel.name",         "Crib Properties Ltd",  "billing", "Airtel Money Account Name"),
        ("billing.cash.instructions",
         "Pay at our Kampala office. Contact billing@crib.ug to arrange.",
         "billing", "Cash Payment Instructions"),
    ]
    for key, value, category, label in settings:
        conn.execute(sa.text(
            "INSERT INTO system_settings "
            "(key, value, category, label, description, value_type, is_secret, is_required) "
            "VALUES (:k, :v, :cat, :lbl, '', 'string', false, false) "
            "ON CONFLICT (key) DO NOTHING"
        ), {"k": key, "v": value, "cat": category, "lbl": label})


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DROP TABLE IF EXISTS subscription_audit_log CASCADE"))
    conn.execute(sa.text("DROP TABLE IF EXISTS subscription_payments CASCADE"))
    conn.execute(sa.text("DROP TABLE IF EXISTS subscription_invoices CASCADE"))
    conn.execute(sa.text("DROP TABLE IF EXISTS organisation_subscriptions CASCADE"))
    conn.execute(sa.text("DROP TABLE IF EXISTS subscription_plans CASCADE"))
    conn.execute(sa.text("DELETE FROM system_settings WHERE category = 'billing'"))
    for t in [
        "subscription_event_enum", "billing_currency_enum", "invoice_status_enum",
        "subscription_payment_status_enum", "subscription_payment_method_enum",
        "billing_cycle_enum", "subscription_status_enum",
    ]:
        conn.execute(sa.text(f"DROP TYPE IF EXISTS {t}"))
