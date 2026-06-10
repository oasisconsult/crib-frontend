"""
System settings endpoints — superadmin only.

All endpoints require Role.superadmin. These manage platform-wide configuration
(storage provider, email/SMS credentials, feature flags) that a platform
operator controls via the admin UI.

Endpoints:
  GET  /admin/settings                    — all settings grouped by category
  GET  /admin/settings/{key}              — single setting (secret masked)
  PUT  /admin/settings/{key}              — update value (encrypts secrets)
  POST /admin/settings/test/storage       — test storage connection
  POST /admin/settings/test/email         — send test email
  POST /admin/settings/test/sms          — send test SMS
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, require_superadmin
from app.core.database import get_db
from app.schemas.system_setting import (
    GeoBoxTestResult,
    NotificationTestRequest,
    NotificationTestResult,
    SettingOut,
    SettingsByCategoryOut,
    SettingUpdate,
    StorageTestResult,
)
from app.services import settings_service

router = APIRouter(prefix="/admin/settings", tags=["admin"])

# _super enforces the superadmin guard. Handlers that don't use the user value
# bind it to `_` to silence linters while keeping the auth check active.
_super = Depends(require_superadmin())

# ── Public settings (authenticated tenants) ────────────────────────────────────

# Keys exposed to any authenticated user via GET /settings/public.
# Only non-secret, tenant-facing values belong here.
PUBLIC_SETTING_KEYS: frozenset[str] = frozenset({
    "geobox.whatsapp_number",
    "agency.name",
    "agency.contact_phone",
    "agency.contact_email",
})

public_router = APIRouter(prefix="/settings", tags=["settings"])


@public_router.get("/public", response_model=dict[str, str])
async def get_public_settings(
    _: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return a small set of non-secret settings that authenticated tenants need."""
    return await settings_service.get_public(PUBLIC_SETTING_KEYS, db)


# ── Read ───────────────────────────────────────────────────────────────────────

@router.get("", response_model=SettingsByCategoryOut)
async def get_all_settings(
    _: CurrentUser = _super,
    db: AsyncSession = Depends(get_db),
):
    """Return all settings grouped by category. Secrets shown as '••••••'."""
    return await settings_service.list_grouped(db)


@router.get("/{key:path}", response_model=SettingOut)
async def get_setting(
    key: str,
    _: CurrentUser = _super,
    db: AsyncSession = Depends(get_db),
):
    """Return a single setting. Secret values are always masked."""
    return await settings_service.get_one_masked(key, db)


# ── Write ──────────────────────────────────────────────────────────────────────

@router.put("/{key:path}", response_model=SettingOut)
async def update_setting(
    key: str,
    body: SettingUpdate,
    current_user: CurrentUser = _super,
    db: AsyncSession = Depends(get_db),
):
    """
    Update a setting value.
    - Secret values are Fernet-encrypted before storage.
    - Passing an empty string clears the value.
    - The response always masks secrets as '••••••'.
    """
    return await settings_service.update(
        key=key,
        value=body.value,
        updated_by=current_user.sub,
        db=db,
    )


# ── Connection tests ───────────────────────────────────────────────────────────

@router.post("/test/storage", response_model=StorageTestResult)
async def test_storage(
    _: CurrentUser = _super,
    db: AsyncSession = Depends(get_db),
):
    """Upload and delete a canary object to verify storage credentials."""
    result = await settings_service.test_storage(db)
    return StorageTestResult(**result)


@router.post("/test/email", response_model=NotificationTestResult)
async def test_email(
    body: NotificationTestRequest,
    _: CurrentUser = _super,
    db: AsyncSession = Depends(get_db),
):
    """Send a test email to verify email provider credentials."""
    result = await settings_service.test_email(body.recipient, db)
    return NotificationTestResult(**result)


@router.post("/test/sms", response_model=NotificationTestResult)
async def test_sms(
    body: NotificationTestRequest,
    _: CurrentUser = _super,
    db: AsyncSession = Depends(get_db),
):
    """Send a test SMS to verify SMS provider credentials."""
    result = await settings_service.test_sms(body.recipient, db)
    return NotificationTestResult(**result)


@router.post("/test/geobox", response_model=GeoBoxTestResult)
async def test_geobox(
    _: CurrentUser = _super,
    db: AsyncSession = Depends(get_db),
):
    """Attempt a GeoBox OAuth token exchange to verify client_id and client_secret."""
    result = await settings_service.test_geobox(db)
    return GeoBoxTestResult(**result)


# ── Public (authenticated, any role) ─────────────────────────────────────────

PUBLIC_SETTING_KEYS: frozenset[str] = frozenset({
    "geobox.whatsapp_number",
    "agency.name",
    "agency.contact_phone",
    "agency.contact_email",
})

public_router = APIRouter(prefix="/settings", tags=["settings"])


@public_router.get("/public", response_model=dict[str, str])
async def get_public_settings(
    _: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the allowlisted non-secret settings for any authenticated user."""
    from sqlalchemy import select as _select
    from app.models.system_setting import SystemSetting as _SM

    result = await db.execute(
        _select(_SM).where(_SM.key.in_(PUBLIC_SETTING_KEYS))
    )
    rows = result.scalars().all()
    found = {row.key: row.value for row in rows}
    defaults = {k: "" for k in PUBLIC_SETTING_KEYS}
    return {**defaults, **found}
