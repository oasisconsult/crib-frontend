"""
SystemSetting model — platform-wide configuration managed by superadmins.

Design decisions:
  - String primary key (dot-notation key, e.g. "storage.provider")
  - No organisation_id — these are platform settings, not per-org
  - Secrets (is_secret=True) are Fernet-encrypted before storage
  - The API always masks secret values as "••••••" in responses
  - value_type drives UI input rendering and safe type coercion on read

Categories:
  storage   — file upload provider and credentials
  email     — transactional email provider and credentials
  sms       — SMS provider and credentials
  whatsapp  — WhatsApp Business API credentials
  platform  — business defaults (currency, timezone, limits)
  features  — feature flags (booleans)
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class SystemSetting(Base):
    __tablename__ = "system_settings"

    # Dot-notation key — e.g. "storage.s3.access_key_id"
    key: Mapped[str] = mapped_column(String(120), primary_key=True)

    # Raw or Fernet-encrypted value (always stored as text)
    value: Mapped[str] = mapped_column(Text, nullable=False, default="")

    # Metadata
    category: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")

    # "string" | "integer" | "boolean" | "json"
    value_type: Mapped[str] = mapped_column(String(20), nullable=False, default="string")

    # If True: value is Fernet-encrypted; never returned in plain text via API
    is_secret: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # If True: setting must be non-empty for the feature to work
    is_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Audit
    updated_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<SystemSetting {self.key!r} category={self.category}>"


# ── Seed defaults ─────────────────────────────────────────────────────────────
# Imported by both the Alembic migration and the test conftest so both stay in sync.
# Tuple layout: (key, value, category, label, description, value_type, is_secret, is_required)

SYSTEM_SETTING_DEFAULTS: list[tuple] = [
    # ── Storage ──────────────────────────────────────────────────────────────
    ("storage.provider",            "local",    "storage", "Storage Provider",
     "File upload backend: 'local' (dev), 's3' (AWS), 'r2' (Cloudflare R2), or 'minio'.",
     "string", False, True),
    ("storage.s3.bucket",           "",         "storage", "S3 Bucket Name",
     "Bucket name — used for S3, R2, and MinIO.", "string", False, False),
    ("storage.s3.region",           "us-east-1","storage", "S3 Region",
     "AWS region (e.g. 'eu-west-1'). Not used for R2 or MinIO.", "string", False, False),
    ("storage.s3.endpoint_url",     "",         "storage", "S3 Endpoint URL",
     "Override endpoint for R2 or MinIO. Leave empty for AWS.", "string", False, False),
    ("storage.s3.public_base_url",  "",         "storage", "Public Base URL",
     "CDN or public URL prefix for uploaded files.", "string", False, False),
    ("storage.s3.access_key_id",    "",         "storage", "S3 Access Key ID",
     "AWS/R2/MinIO access key ID.", "string", True, False),
    ("storage.s3.secret_access_key","",         "storage", "S3 Secret Access Key",
     "AWS/R2/MinIO secret access key.", "string", True, False),

    # ── Email ─────────────────────────────────────────────────────────────────
    ("email.provider",              "sendgrid", "email",   "Email Provider",
     "Transactional email backend: 'sendgrid' or 'smtp'.", "string", False, True),
    ("email.from_address",          "noreply@crib.app", "email", "From Address",
     "Sender email address for all outgoing email.", "string", False, True),
    ("email.from_name",             "Crib",     "email",   "From Name",
     "Sender display name.", "string", False, True),
    ("email.sendgrid.api_key",      "",         "email",   "SendGrid API Key",
     "SendGrid API key (starts with SG.).", "string", True, False),
    ("email.smtp.host",             "localhost","email",   "SMTP Host",
     "SMTP server hostname.", "string", False, False),
    ("email.smtp.port",             "587",      "email",   "SMTP Port",
     "SMTP port (587 for STARTTLS, 465 for SSL).", "integer", False, False),
    ("email.smtp.username",         "",         "email",   "SMTP Username",
     "SMTP authentication username.", "string", False, False),
    ("email.smtp.password",         "",         "email",   "SMTP Password",
     "SMTP authentication password.", "string", True, False),
    ("email.smtp.use_tls",          "true",     "email",   "SMTP Use TLS",
     "Use STARTTLS when connecting to the SMTP server.", "boolean", False, False),

    # ── SMS ───────────────────────────────────────────────────────────────────
    ("sms.provider",                "twilio",   "sms",     "SMS Provider",
     "SMS backend: 'twilio' or 'africastalking'.", "string", False, True),
    ("sms.twilio.account_sid",      "",         "sms",     "Twilio Account SID",
     "Twilio account SID (starts with AC).", "string", False, False),
    ("sms.twilio.auth_token",       "",         "sms",     "Twilio Auth Token",
     "Twilio auth token.", "string", True, False),
    ("sms.twilio.from_number",      "",         "sms",     "Twilio From Number",
     "Twilio phone number in E.164 format.", "string", False, False),
    ("sms.africastalking.api_key",  "",         "sms",     "Africa's Talking API Key",
     "Africa's Talking API key.", "string", True, False),
    ("sms.africastalking.username", "",         "sms",     "Africa's Talking Username",
     "Africa's Talking application username.", "string", False, False),
    ("sms.africastalking.sender_id","",         "sms",     "Africa's Talking Sender ID",
     "Registered sender ID for branded SMS.", "string", False, False),

    # ── WhatsApp ──────────────────────────────────────────────────────────────
    ("whatsapp.meta.api_key",       "",         "whatsapp","Meta WhatsApp API Key",
     "Meta Cloud API permanent token for WhatsApp Business.", "string", True, False),
    ("whatsapp.meta.phone_id",      "",         "whatsapp","WhatsApp Phone ID",
     "Phone number ID from Meta Business Suite.", "string", False, False),
    ("whatsapp.meta.business_id",   "",         "whatsapp","WhatsApp Business ID",
     "Business account ID from Meta Business Suite.", "string", False, False),

    # ── Platform ──────────────────────────────────────────────────────────────
    ("platform.default_currency",   "UGX",      "platform","Default Currency",
     "ISO 4217 currency code used as the platform default.", "string", False, True),
    ("platform.default_timezone",   "Africa/Kampala", "platform", "Default Timezone",
     "IANA timezone identifier for date/time display.", "string", False, True),
    ("platform.support_email",      "support@crib.app","platform","Support Email",
     "Contact email shown to users.", "string", False, False),
    ("platform.support_phone",      "",         "platform","Support Phone",
     "Contact phone shown to users (E.164 format).", "string", False, False),
    ("platform.max_upload_mb",      "10",       "platform","Max Upload Size (MB)",
     "Maximum file upload size in megabytes.", "integer", False, True),

    # ── Agency / Landlord branding ────────────────────────────────────────────
    ("agency.name",          "",  "agency", "Agency / Landlord Name",
     "Business name or landlord name shown on tenancy agreements and correspondence.",
     "string", False, False),
    ("agency.contact_phone", "",  "agency", "Agency Contact Phone",
     "Phone number shown on tenancy agreements (E.164 or local format, e.g. +256 700 000000).",
     "string", False, False),
    ("agency.contact_email", "",  "agency", "Agency Contact Email",
     "Email address shown on tenancy agreements and tenant-facing communications.",
     "string", False, False),

    # ── Features ─────────────────────────────────────────────────────────────
    ("features.esignature_enabled", "true",     "features","E-Signature Enabled",
     "Enable the DocuSign-style e-signature flow for lease signing.", "boolean", False, True),
    ("features.maintenance_portal", "true",     "features","Tenant Maintenance Portal",
     "Allow tenants to submit maintenance requests from the tenant portal.", "boolean", False, True),
    ("features.onboarding_enabled", "true",     "features","Tenant Onboarding",
     "Enable the self-service onboarding wizard for new tenants.", "boolean", False, True),

    # ── Payments ──────────────────────────────────────────────────────────────
    ("payments.auto_confirm_enabled", "false", "payments", "Auto-Confirm Payments",
     "When enabled, payments from configured methods are confirmed automatically "
     "without manager action. Disable to require manual confirmation for all payments.",
     "boolean", False, True),
    ("payments.auto_confirm_methods", "mobile_money_mtn,mobile_money_airtel", "payments",
     "Auto-Confirm Methods",
     "Comma-separated list of payment methods that trigger automatic confirmation "
     "when auto-confirm is enabled. Options: cash, bank_transfer, mobile_money_mtn, "
     "mobile_money_airtel.",
     "string", False, False),
    ("payments.advance_payment_months", "1", "payments", "Default Advance Rent Months",
     "Default number of months rent required in advance during tenant onboarding. "
     "Can be overridden per-property or per-unit via the billing rules.",
     "integer", False, True),
]
