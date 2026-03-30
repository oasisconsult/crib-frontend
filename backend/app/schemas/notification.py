"""Pydantic schemas for the notifications domain."""

from __future__ import annotations

from pydantic import BaseModel, Field


# ── Templates ──────────────────────────────────────────────────────────────────

class TemplateCreate(BaseModel):
    name: str
    trigger: str
    channel: str
    subject: str | None = None
    body: str
    variables: list[str] = Field(default_factory=list)
    is_active: bool = True


class TemplateUpdate(BaseModel):
    name: str | None = None
    subject: str | None = None
    body: str | None = None
    variables: list[str] | None = None
    is_active: bool | None = None


class TemplatePreview(BaseModel):
    variables: dict[str, str] = Field(default_factory=dict)


class TemplateOut(BaseModel):
    id: str
    organisation_id: str
    name: str
    trigger: str
    channel: str
    subject: str | None
    body: str
    variables: list[str]
    is_active: bool
    created_at: str
    updated_at: str


# ── Notifications ──────────────────────────────────────────────────────────────

class NotificationSend(BaseModel):
    """Payload to manually queue and send a notification."""
    channel: str
    trigger: str
    template_id: str | None = None
    tenant_id: str | None = None
    recipient_name: str
    recipient_email: str | None = None
    recipient_phone: str | None = None
    subject: str | None = None
    body: str
    property_id: str | None = None
    lease_id: str | None = None
    payment_id: str | None = None


class NotificationOut(BaseModel):
    id: str
    organisation_id: str
    template_id: str | None
    tenant_id: str | None
    channel: str
    trigger: str
    recipient_name: str
    recipient_email: str | None
    recipient_phone: str | None
    subject: str | None
    body: str
    state: str
    queued_at: str
    sent_at: str | None
    delivered_at: str | None
    read_at: str | None
    failed_at: str | None
    failure_reason: str | None
    retry_count: int
    external_message_id: str | None
    property_id: str | None
    lease_id: str | None
    payment_id: str | None
    created_at: str


class NotificationStatsOut(BaseModel):
    total: int
    sent: int
    delivered: int
    read: int
    failed: int
    delivery_rate: float
    read_rate: float
    by_channel: dict[str, int]
