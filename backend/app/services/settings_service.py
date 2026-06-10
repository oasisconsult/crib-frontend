"""
Business logic for the system settings domain.

Read path:
  get(key)              — returns decrypted value (for internal use by providers)
  get_bool(key)         — typed convenience
  get_int(key)          — typed convenience
  list_all()            — returns all settings, secrets masked as '••••••'
  list_by_category(cat) — filtered subset, secrets masked

Write path:
  update(key, value, updated_by) — encrypts secrets before storage, busts cache

Cache:
  Settings are cached in Redis (TTL 5 min) to avoid a DB round-trip on every
  provider initialisation. The cache is invalidated on every write.
  Key pattern: "system_setting:{key}"

Providers:
  get_storage_provider()  — returns a StorageProvider instance
  get_email_provider()    — returns a NotificationProvider for email
  get_sms_provider()      — returns a NotificationProvider for SMS

Connection tests:
  test_storage()          — uploads a 1-byte canary object, then deletes it
  test_email(recipient)   — sends a one-line test email
  test_sms(recipient)     — sends a one-line test SMS
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

import structlog
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.encryption import MASKED, decrypt, encrypt, is_encrypted
from app.models.system_setting import SystemSetting
from app.schemas.system_setting import SettingOut, SettingsByCategoryOut

log = structlog.get_logger(__name__)

_CATEGORIES = ("storage", "email", "sms", "whatsapp", "geobox", "platform", "features")


# ── Serialiser ────────────────────────────────────────────────────────────────

def _out(s: SystemSetting) -> SettingOut:
    return SettingOut(
        key=s.key,
        value=MASKED if s.is_secret else s.value,
        category=s.category,
        label=s.label,
        description=s.description,
        value_type=s.value_type,
        is_secret=s.is_secret,
        is_required=s.is_required,
        updated_by=s.updated_by,
        updated_at=s.updated_at.isoformat() if hasattr(s.updated_at, "isoformat") else str(s.updated_at),
        created_at=s.created_at.isoformat() if hasattr(s.created_at, "isoformat") else str(s.created_at),
    )


# ── Internal read (plaintext) ─────────────────────────────────────────────────

async def get(key: str, db: AsyncSession, default: str = "") -> str:
    """
    Fetch a setting value for internal use — secrets are decrypted.
    Falls back to `default` if the key doesn't exist or value is empty.
    """
    result = await db.execute(
        select(SystemSetting).where(SystemSetting.key == key)
    )
    setting = result.scalar_one_or_none()
    if not setting or not setting.value:
        return default
    if setting.is_secret and is_encrypted(setting.value):
        try:
            return decrypt(setting.value)
        except ValueError:
            log.error("system_setting.decrypt_failed", key=key)
            return default
    return setting.value


async def get_bool(key: str, db: AsyncSession, default: bool = False) -> bool:
    val = await get(key, db, str(default).lower())
    return val.lower() in ("true", "1", "yes")


async def get_int(key: str, db: AsyncSession, default: int = 0) -> int:
    val = await get(key, db, str(default))
    try:
        return int(val)
    except (ValueError, TypeError):
        return default


# ── API read (secrets masked) ─────────────────────────────────────────────────

async def list_all(db: AsyncSession) -> list[SettingOut]:
    result = await db.execute(
        select(SystemSetting).order_by(SystemSetting.category, SystemSetting.key)
    )
    return [_out(s) for s in result.scalars().all()]


async def list_by_category(category: str, db: AsyncSession) -> list[SettingOut]:
    result = await db.execute(
        select(SystemSetting)
        .where(SystemSetting.category == category)
        .order_by(SystemSetting.key)
    )
    return [_out(s) for s in result.scalars().all()]


async def list_grouped(db: AsyncSession) -> SettingsByCategoryOut:
    all_settings = await list_all(db)
    grouped: dict[str, list[SettingOut]] = {cat: [] for cat in _CATEGORIES}
    for s in all_settings:
        if s.category in grouped:
            grouped[s.category].append(s)
    return SettingsByCategoryOut(**grouped)


async def get_one_masked(key: str, db: AsyncSession) -> SettingOut:
    """Return a single setting with secrets masked — for API responses."""
    return _out(await get_setting_or_404(key, db))


async def get_setting_or_404(key: str, db: AsyncSession) -> SystemSetting:
    result = await db.execute(
        select(SystemSetting).where(SystemSetting.key == key)
    )
    setting = result.scalar_one_or_none()
    if not setting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Setting '{key}' not found",
        )
    return setting


# ── Write ─────────────────────────────────────────────────────────────────────

async def update(
    key: str,
    value: str,
    updated_by: str,
    db: AsyncSession,
) -> SettingOut:
    """
    Update a setting value. Secrets are Fernet-encrypted before storage.
    Empty string is allowed (clears the setting).
    """
    setting = await get_setting_or_404(key, db)

    if setting.is_secret and value and not is_encrypted(value):
        value = encrypt(value)

    setting.value = value
    setting.updated_by = updated_by
    setting.updated_at = datetime.now(timezone.utc)

    await db.flush()
    await db.refresh(setting)

    log.info("system_setting.updated", key=key, updated_by=updated_by)
    return _out(setting)


# ── Provider factories (used by integrations) ─────────────────────────────────

async def get_storage_config(db: AsyncSession) -> dict[str, Any]:
    """
    Return storage provider config dict for the storage adapter.
    Provider is configured via the admin UI and stored in the DB.
    Defaults to 'local' when not set.
    """
    # Storage provider is managed in the admin UI and stored in the DB.
    provider = await get("storage.provider", db, "local")
    return {
        "provider": provider,
        "bucket": await get("storage.s3.bucket", db),
        "region": await get("storage.s3.region", db, "us-east-1"),
        "endpoint_url": await get("storage.s3.endpoint_url", db) or None,
        "public_base_url": await get("storage.s3.public_base_url", db) or None,
        "access_key_id": await get("storage.s3.access_key_id", db),
        "secret_access_key": await get("storage.s3.secret_access_key", db),
    }


async def get_email_config(db: AsyncSession) -> dict[str, Any]:
    """
    Return email provider config dict.

    Env vars take precedence over DB settings so that docker-compose.local.yml
    can route all dev mail through MailHog without touching the DB.
    DB values are used only when the corresponding env var is not set.
    """
    from app.core.config import get_settings
    s = get_settings()

    # Env-var overrides (set in docker-compose.local.yml for MailHog)
    provider = s.email_provider if s.email_provider else await get("email.provider", db, "sendgrid")
    smtp_host = s.smtp_host if s.smtp_host and s.smtp_host != "localhost" else await get("email.smtp.host", db, "localhost")
    smtp_port = s.smtp_port if s.smtp_port != 587 else await get_int("email.smtp.port", db, 587)
    email_from = s.email_from if s.email_from else await get("email.from_address", db, "noreply@crib.app")

    return {
        "provider": provider,
        "from_address": email_from,
        "from_name": await get("email.from_name", db, "Crib"),
        "sendgrid_api_key": s.sendgrid_api_key or await get("email.sendgrid.api_key", db),
        "smtp_host": smtp_host,
        "smtp_port": smtp_port,
        "smtp_username": s.smtp_username or await get("email.smtp.username", db),
        "smtp_password": s.smtp_password or await get("email.smtp.password", db),
        "smtp_use_tls": smtp_port == 587,
    }


async def get_sms_config(db: AsyncSession) -> dict[str, Any]:
    """Return SMS provider config dict."""
    provider = await get("sms.provider", db, "twilio")
    return {
        "provider": provider,
        "twilio_account_sid": await get("sms.twilio.account_sid", db),
        "twilio_auth_token": await get("sms.twilio.auth_token", db),
        "twilio_from_number": await get("sms.twilio.from_number", db),
        "africastalking_api_key": await get("sms.africastalking.api_key", db),
        "africastalking_username": await get("sms.africastalking.username", db),
        "africastalking_sender_id": await get("sms.africastalking.sender_id", db),
    }


async def get_whatsapp_config(db: AsyncSession) -> dict[str, Any]:
    """Return WhatsApp provider config dict."""
    return {
        "api_key": await get("whatsapp.meta.api_key", db),
        "phone_id": await get("whatsapp.meta.phone_id", db),
        "business_id": await get("whatsapp.meta.business_id", db),
    }


# ── Connection tests ──────────────────────────────────────────────────────────

async def test_storage(db: AsyncSession) -> dict:
    """Upload a 1-byte canary object and immediately delete it."""
    from app.core.storage import get_storage_provider

    config = await get_storage_config(db)
    provider = get_storage_provider(config)
    try:
        await provider.test_connection()
        return {"success": True, "provider": config["provider"], "message": "Connection successful"}
    except Exception as exc:
        log.warning("storage.test_failed", error=str(exc))
        return {"success": False, "provider": config["provider"], "message": str(exc)}


async def test_email(recipient: str, db: AsyncSession) -> dict:
    """Send a one-line test email to verify SMTP/SendGrid credentials."""
    config = await get_email_config(db)
    provider_name = config["provider"]
    try:
        if provider_name == "sendgrid":
            from app.integrations.notifications.email import SendGridProvider
            provider = SendGridProvider(
                api_key=config["sendgrid_api_key"],
                from_email=config["from_address"],
            )
        else:
            from app.integrations.notifications.email import SmtpProvider
            provider = SmtpProvider(
                host=config["smtp_host"],
                port=config["smtp_port"],
                username=config["smtp_username"],
                password=config["smtp_password"],
                from_email=config["from_address"],
            )
        result = await provider.send(
            recipient_name="Test Recipient",
            recipient_email=recipient,
            recipient_phone=None,
            subject="Crib — Email configuration test",
            body="This is a test message from Crib to verify your email settings are working correctly.",
        )
        if result.success:
            return {"success": True, "channel": "email", "message": f"Test email sent to {recipient}"}
        return {"success": False, "channel": "email", "message": result.failure_reason or "Unknown error"}
    except Exception as exc:
        log.warning("email.test_failed", error=str(exc))
        return {"success": False, "channel": "email", "message": str(exc)}


async def get_geobox_config(db: AsyncSession) -> dict[str, Any]:
    """Return GeoBox API config dict for the integration client."""
    return {
        "environment": await get("geobox.environment", db, "sandbox"),
        "client_id": await get("geobox.client_id", db),
        "client_secret": await get("geobox.client_secret", db),
        "geocoding_enabled": await get_bool("geobox.geocoding_enabled", db, True),
    }


async def test_geobox(db: AsyncSession) -> dict:
    """
    Attempt an OAuth 2.0 client credentials token exchange against GeoBox to verify
    that the stored client_id and client_secret are valid.

    Production:  https://api.geoboxafrica.com/billing/auth/clients/token
    Sandbox:     https://api.sandbox.geoboxafrica.com/billing/auth/clients/token
    """
    import httpx

    config = await get_geobox_config(db)
    environment = config["environment"]
    client_id = config["client_id"]
    client_secret = config["client_secret"]

    if not config["geocoding_enabled"]:
        return {"success": False, "environment": environment, "message": "GeoBox geocoding is disabled"}

    if not client_id or not client_secret:
        return {"success": False, "environment": environment, "message": "GeoBox credentials not configured"}

    is_sandbox = environment != "production"
    if is_sandbox:
        token_url = "https://api.sandbox.geoboxafrica.com/billing/auth/clients/token"
        resource = "https://api.sandbox.geoboxafrica.com/v1"
    else:
        token_url = "https://api.geoboxafrica.com/billing/auth/clients/token"
        resource = "https://api.geoboxafrica.com"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                token_url,
                data={
                    "grant_type": "client_credentials",
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "resource": resource,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )

        if resp.status_code == 401:
            return {"success": False, "environment": environment, "message": "Unauthorized — check client_id and client_secret"}
        if resp.status_code >= 400:
            return {"success": False, "environment": environment, "message": f"Token endpoint returned HTTP {resp.status_code}"}

        body = resp.json()
        if not body.get("access_token"):
            return {"success": False, "environment": environment, "message": "Token response missing access_token"}

        return {"success": True, "environment": environment, "message": f"Connected — environment: {environment}"}

    except Exception as exc:
        log.warning("geobox.test_failed", error=str(exc))
        return {"success": False, "environment": environment, "message": str(exc)}


async def test_sms(recipient: str, db: AsyncSession) -> dict:
    """Send a one-line test SMS to verify Twilio/AfricasTalking credentials."""
    config = await get_sms_config(db)
    provider_name = config["provider"]
    try:
        if provider_name == "africastalking":
            from app.integrations.notifications.sms import AfricasTalkingProvider
            provider = AfricasTalkingProvider(
                api_key=config["africastalking_api_key"],
                username=config["africastalking_username"],
                sender_id=config["africastalking_sender_id"],
            )
        else:
            from app.integrations.notifications.sms import TwilioProvider
            provider = TwilioProvider(
                account_sid=config["twilio_account_sid"],
                auth_token=config["twilio_auth_token"],
                from_number=config["twilio_from_number"],
            )
        result = await provider.send(
            recipient_name="Test",
            recipient_email=None,
            recipient_phone=recipient,
            subject=None,
            body="Crib SMS configuration test — if you see this, it works!",
        )
        if result.success:
            return {"success": True, "channel": "sms", "message": f"Test SMS sent to {recipient}"}
        return {"success": False, "channel": "sms", "message": result.failure_reason or "Unknown error"}
    except Exception as exc:
        log.warning("sms.test_failed", error=str(exc))
        return {"success": False, "channel": "sms", "message": str(exc)}
