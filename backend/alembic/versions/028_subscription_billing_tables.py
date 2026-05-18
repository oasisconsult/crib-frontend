"""028 — Subscription & Billing tables

Revision ID: 028
Revises: 027
Create Date: 2026-05-18

Creates:
  subscription_plans            — product catalogue (Free/Professional/Agency/Enterprise)
  organisation_subscriptions    — one active subscription per org
  subscription_payments         — proof-of-payment records (separate from rent payments)
  subscription_invoices         — generated invoices
  subscription_audit_log        — immutable lifecycle event trail

Also seeds:
  - Four default subscription plans
  - Billing system settings (VAT, bank details, trial/grace periods)
"""
from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import datetime, timezone

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "028"
down_revision: str | None = "027"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# ─── Enum type names ──────────────────────────────────────────────────────────

SUBSCRIPTION_STATUS_ENUM = "subscription_status_enum"
BILLING_CYCLE_ENUM = "billing_cycle_enum"
SUBSCRIPTION_PAYMENT_METHOD_ENUM = "subscription_payment_method_enum"
SUBSCRIPTION_PAYMENT_STATUS_ENUM = "subscription_payment_status_enum"
INVOICE_STATUS_ENUM = "invoice_status_enum"
BILLING_CURRENCY_ENUM = "billing_currency_enum"
SUBSCRIPTION_EVENT_ENUM = "subscription_event_enum"


def upgrade() -> None:
    # ── Create enum types idempotently ────────────────────────────────────────
    # Use DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN null; END $$ so
    # the migration is safe to re-run if it was interrupted after enum creation
    # but before table creation.
    for stmt in [
        "DO $$ BEGIN CREATE TYPE subscription_status_enum AS ENUM ("
        "'trialing','active','pending_payment','pending_verification',"
        "'grace_period','past_due','suspended','cancelled','expired'"
        "); EXCEPTION WHEN duplicate_object THEN null; END $$",

        "DO $$ BEGIN CREATE TYPE billing_cycle_enum AS ENUM ("
        "'none','monthly','annual'"
        "); EXCEPTION WHEN duplicate_object THEN null; END $$",

        "DO $$ BEGIN CREATE TYPE subscription_payment_method_enum AS ENUM ("
        "'mtn_momo','airtel_money','bank_transfer','cash'"
        "); EXCEPTION WHEN duplicate_object THEN null; END $$",

        "DO $$ BEGIN CREATE TYPE subscription_payment_status_enum AS ENUM ("
        "'pending','pending_verification','verified','rejected','refunded'"
        "); EXCEPTION WHEN duplicate_object THEN null; END $$",

        "DO $$ BEGIN CREATE TYPE invoice_status_enum AS ENUM ("
        "'draft','issued','paid','void','overdue'"
        "); EXCEPTION WHEN duplicate_object THEN null; END $$",

        "DO $$ BEGIN CREATE TYPE billing_currency_enum AS ENUM ("
        "'UGX','USD'"
        "); EXCEPTION WHEN duplicate_object THEN null; END $$",

        "DO $$ BEGIN CREATE TYPE subscription_event_enum AS ENUM ("
        "'created','upgraded','downgraded','cancelled','reinstated',"
        "'payment_submitted','payment_verified','payment_rejected',"
        "'suspended','grace_period_started','expired','trial_started','plan_changed'"
        "); EXCEPTION WHEN duplicate_object THEN null; END $$",
    ]:
        op.execute(sa.text(stmt))

    # ── subscription_plans ────────────────────────────────────────────────────
    op.create_table(
        "subscription_plans",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("slug", sa.String(50), unique=True, nullable=False, index=True),
        sa.Column("description", sa.Text, nullable=True),

        # Pricing — stored as integers (smallest unit) to avoid float issues
        # UGX has no sub-units so we store the full amount
        sa.Column("monthly_price_ugx", sa.BigInteger, nullable=False, default=0),
        sa.Column("annual_price_ugx", sa.BigInteger, nullable=False, default=0),
        sa.Column("monthly_price_usd_cents", sa.Integer, nullable=False, default=0),
        sa.Column("annual_price_usd_cents", sa.Integer, nullable=False, default=0),

        # Limits (-1 = unlimited)
        sa.Column("max_properties", sa.Integer, nullable=False, default=1),
        sa.Column("max_units", sa.Integer, nullable=False, default=5),
        sa.Column("max_users", sa.Integer, nullable=False, default=1),
        sa.Column("max_storage_mb", sa.Integer, nullable=False, default=100),

        # Feature flags blob
        # e.g. {"analytics_advanced": true, "api_access": false, "custom_branding": false}
        sa.Column("features", JSONB, nullable=False, server_default="{}"),

        sa.Column("trial_days", sa.Integer, nullable=False, default=0),
        sa.Column("is_active", sa.Boolean, nullable=False, default=True),
        sa.Column("is_publicly_visible", sa.Boolean, nullable=False, default=True),
        sa.Column("display_order", sa.Integer, nullable=False, default=0),

        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    # ── organisation_subscriptions ────────────────────────────────────────────
    op.create_table(
        "organisation_subscriptions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organisation_id", UUID(as_uuid=True), sa.ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, unique=True, index=True),
        sa.Column("plan_id", UUID(as_uuid=True), sa.ForeignKey("subscription_plans.id"), nullable=False),

        sa.Column("status", sa.String(50), nullable=False, server_default="active"),
        sa.Column("billing_cycle", sa.String(20), nullable=False, server_default="none"),
        sa.Column("currency", sa.String(10), nullable=False, server_default="UGX"),

        sa.Column("current_period_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("trial_ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("grace_period_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_invoice_date", sa.DateTime(timezone=True), nullable=True),

        sa.Column("auto_renew", sa.Boolean, nullable=False, default=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancellation_reason", sa.Text, nullable=True),

        # Snapshot of price paid (denormalised for history)
        sa.Column("price_paid", sa.BigInteger, nullable=True),
        sa.Column("price_currency", sa.String(3), nullable=True),

        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    # ── subscription_invoices ─────────────────────────────────────────────────
    op.create_table(
        "subscription_invoices",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organisation_id", UUID(as_uuid=True), sa.ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("subscription_id", UUID(as_uuid=True), sa.ForeignKey("organisation_subscriptions.id"), nullable=False),

        sa.Column("invoice_number", sa.String(30), unique=True, nullable=False, index=True),
        sa.Column("subtotal", sa.BigInteger, nullable=False),
        sa.Column("tax_amount", sa.BigInteger, nullable=False, default=0),
        sa.Column("total", sa.BigInteger, nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, default="UGX"),

        sa.Column("period_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("due_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),

        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("pdf_file_key", sa.String(500), nullable=True),
        sa.Column("line_items", JSONB, nullable=False, server_default="[]"),
        sa.Column("notes", sa.Text, nullable=True),

        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    # ── subscription_payments ─────────────────────────────────────────────────
    op.create_table(
        "subscription_payments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organisation_id", UUID(as_uuid=True), sa.ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("subscription_id", UUID(as_uuid=True), sa.ForeignKey("organisation_subscriptions.id"), nullable=False),
        sa.Column("invoice_id", UUID(as_uuid=True), sa.ForeignKey("subscription_invoices.id"), nullable=True),

        sa.Column("payment_method", sa.String(30), nullable=False),
        sa.Column("amount", sa.BigInteger, nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, default="UGX"),

        # Provider-supplied or user-entered reference
        sa.Column("transaction_reference", sa.String(200), nullable=True),
        sa.Column("phone_number", sa.String(20), nullable=True),     # for mobile money
        sa.Column("account_name", sa.String(200), nullable=True),
        sa.Column("bank_name", sa.String(200), nullable=True),
        sa.Column("transfer_date", sa.Date, nullable=True),

        # Uploaded proof (S3/MinIO key)
        sa.Column("proof_file_key", sa.String(500), nullable=True),
        sa.Column("proof_uploaded_at", sa.DateTime(timezone=True), nullable=True),

        sa.Column("status", sa.String(30), nullable=False, server_default="pending"),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),

        # Admin verification fields
        sa.Column("verified_by_id", UUID(as_uuid=True), sa.ForeignKey("profiles.id"), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejection_reason", sa.Text, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),

        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    # ── subscription_audit_log ────────────────────────────────────────────────
    op.create_table(
        "subscription_audit_log",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organisation_id", UUID(as_uuid=True), sa.ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("subscription_id", UUID(as_uuid=True), sa.ForeignKey("organisation_subscriptions.id"), nullable=True),
        sa.Column("event_type", sa.String(50), nullable=False),

        # Who triggered the event (NULL = system/cron)
        sa.Column("actor_id", UUID(as_uuid=True), sa.ForeignKey("profiles.id"), nullable=True),

        # Plan change tracking
        sa.Column("from_plan_id", UUID(as_uuid=True), sa.ForeignKey("subscription_plans.id"), nullable=True),
        sa.Column("to_plan_id", UUID(as_uuid=True), sa.ForeignKey("subscription_plans.id"), nullable=True),

        # Arbitrary context (payment ref, reason, etc.)
        sa.Column("metadata", JSONB, nullable=False, server_default="{}"),

        # Immutable — no updated_at
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    # ── Cast string columns to their enum types ───────────────────────────────
    # Tables were created with String columns to avoid SQLAlchemy auto-creating
    # the enum types. Now cast them to the proper enum types.
    for stmt in [
        f"ALTER TABLE organisation_subscriptions ALTER COLUMN status TYPE {SUBSCRIPTION_STATUS_ENUM} USING status::{SUBSCRIPTION_STATUS_ENUM}",
        f"ALTER TABLE organisation_subscriptions ALTER COLUMN billing_cycle TYPE {BILLING_CYCLE_ENUM} USING billing_cycle::{BILLING_CYCLE_ENUM}",
        f"ALTER TABLE organisation_subscriptions ALTER COLUMN currency TYPE {BILLING_CURRENCY_ENUM} USING currency::{BILLING_CURRENCY_ENUM}",
        f"ALTER TABLE subscription_invoices ALTER COLUMN status TYPE {INVOICE_STATUS_ENUM} USING status::{INVOICE_STATUS_ENUM}",
        f"ALTER TABLE subscription_payments ALTER COLUMN payment_method TYPE {SUBSCRIPTION_PAYMENT_METHOD_ENUM} USING payment_method::{SUBSCRIPTION_PAYMENT_METHOD_ENUM}",
        f"ALTER TABLE subscription_payments ALTER COLUMN status TYPE {SUBSCRIPTION_PAYMENT_STATUS_ENUM} USING status::{SUBSCRIPTION_PAYMENT_STATUS_ENUM}",
        f"ALTER TABLE subscription_audit_log ALTER COLUMN event_type TYPE {SUBSCRIPTION_EVENT_ENUM} USING event_type::{SUBSCRIPTION_EVENT_ENUM}",
    ]:
        op.execute(sa.text(stmt))

    # ── Seed subscription plans ───────────────────────────────────────────────
    now = datetime.now(timezone.utc).isoformat()

    plans = [
        {
            "id": str(uuid.uuid4()),
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
            "is_active": True,
            "is_publicly_visible": True,
            "display_order": 1,
            "created_at": now,
            "updated_at": now,
        },
        {
            "id": str(uuid.uuid4()),
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
            "is_active": True,
            "is_publicly_visible": True,
            "display_order": 2,
            "created_at": now,
            "updated_at": now,
        },
        {
            "id": str(uuid.uuid4()),
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
            "is_active": True,
            "is_publicly_visible": True,
            "display_order": 3,
            "created_at": now,
            "updated_at": now,
        },
        {
            "id": str(uuid.uuid4()),
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
            "is_active": True,
            "is_publicly_visible": True,
            "display_order": 4,
            "created_at": now,
            "updated_at": now,
        },
    ]

    op.bulk_insert(
        sa.table(
            "subscription_plans",
            sa.column("id"), sa.column("name"), sa.column("slug"), sa.column("description"),
            sa.column("monthly_price_ugx"), sa.column("annual_price_ugx"),
            sa.column("monthly_price_usd_cents"), sa.column("annual_price_usd_cents"),
            sa.column("max_properties"), sa.column("max_units"), sa.column("max_users"), sa.column("max_storage_mb"),
            sa.column("features"), sa.column("trial_days"),
            sa.column("is_active"), sa.column("is_publicly_visible"), sa.column("display_order"),
            sa.column("created_at"), sa.column("updated_at"),
        ),
        plans,
    )

    # ── Seed billing system settings ──────────────────────────────────────────
    billing_settings = [
        ("billing.vat_rate_percent",    "18",                      "billing", "VAT Rate (%)",               "number",  False, True),
        ("billing.trial_days",          "14",                      "billing", "Default Trial Period (days)", "number",  False, True),
        ("billing.grace_period_days",   "7",                       "billing", "Grace Period (days)",         "number",  False, True),
        ("billing.invoice_prefix",      "CR-INV",                  "billing", "Invoice Number Prefix",       "string",  False, True),
        ("billing.bank.name",           "Stanbic Bank Uganda",     "billing", "Bank Name",                   "string",  False, False),
        ("billing.bank.account_name",   "Crib Properties Ltd",     "billing", "Account Name",                "string",  False, False),
        ("billing.bank.account_number", "9030005812395",           "billing", "Account Number",              "string",  False, False),
        ("billing.bank.branch",         "Garden City Branch",      "billing", "Branch",                      "string",  False, False),
        ("billing.bank.swift_code",     "SBICUGKX",                "billing", "SWIFT / BIC Code",            "string",  False, False),
        ("billing.bank.sort_code",      "",                        "billing", "Sort Code",                   "string",  False, False),
        ("billing.mtn_momo.number",     "+256 77 000 0000",        "billing", "MTN MoMo Number",             "string",  False, False),
        ("billing.mtn_momo.name",       "Crib Properties Ltd",     "billing", "MTN MoMo Account Name",       "string",  False, False),
        ("billing.airtel.number",       "+256 75 000 0000",        "billing", "Airtel Money Number",         "string",  False, False),
        ("billing.airtel.name",         "Crib Properties Ltd",     "billing", "Airtel Money Account Name",   "string",  False, False),
        ("billing.cash.instructions",   "Pay at our Kampala office. Contact billing@crib.ug to arrange.", "billing", "Cash Payment Instructions", "text", False, False),
    ]

    op.bulk_insert(
        sa.table(
            "system_settings",
            sa.column("key"), sa.column("value"), sa.column("category"),
            sa.column("label"), sa.column("value_type"), sa.column("is_secret"),
            sa.column("is_required"),
        ),
        [
            {
                "key": k, "value": v, "category": cat,
                "label": lbl, "value_type": vt,
                "is_secret": secret, "is_required": required,
            }
            for k, v, cat, lbl, vt, secret, required in billing_settings
        ],
    )


def downgrade() -> None:
    op.drop_table("subscription_audit_log")
    op.drop_table("subscription_payments")
    op.drop_table("subscription_invoices")
    op.drop_table("organisation_subscriptions")
    op.drop_table("subscription_plans")

    # Remove seeded system settings
    op.execute("DELETE FROM system_settings WHERE category = 'billing'")

    # Drop enum types idempotently
    for name in [
        SUBSCRIPTION_EVENT_ENUM, BILLING_CURRENCY_ENUM, INVOICE_STATUS_ENUM,
        SUBSCRIPTION_PAYMENT_STATUS_ENUM, SUBSCRIPTION_PAYMENT_METHOD_ENUM,
        BILLING_CYCLE_ENUM, SUBSCRIPTION_STATUS_ENUM,
    ]:
        op.execute(sa.text(f"DROP TYPE IF EXISTS {name}"))
