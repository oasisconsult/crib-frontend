"""Pydantic schemas for the system settings domain."""

from __future__ import annotations

from app.schemas.common import CamelModel


class SettingOut(CamelModel):
    """
    A single system setting as returned by the API.
    Secret values are always returned as '••••••' — never as plaintext.
    """
    key: str
    value: str          # '••••••' when is_secret=True
    category: str
    label: str
    description: str
    value_type: str     # "string" | "integer" | "boolean" | "json"
    is_secret: bool
    is_required: bool
    updated_by: str | None
    updated_at: str
    created_at: str


class SettingUpdate(CamelModel):
    """Payload to update a setting value."""
    value: str


class SettingsByCategoryOut(CamelModel):
    """All settings grouped by category."""
    storage: list[SettingOut]
    email: list[SettingOut]
    sms: list[SettingOut]
    whatsapp: list[SettingOut]
    geobox: list[SettingOut]
    platform: list[SettingOut]
    features: list[SettingOut]


class GeoBoxTestResult(CamelModel):
    success: bool
    environment: str
    message: str


class StorageTestResult(CamelModel):
    success: bool
    provider: str
    message: str


class NotificationTestRequest(CamelModel):
    """Payload for sending a test notification."""
    recipient: str   # email address or phone number


class NotificationTestResult(CamelModel):
    success: bool
    channel: str     # "email" | "sms" | "whatsapp"
    message: str
