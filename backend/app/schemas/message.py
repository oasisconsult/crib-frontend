"""Pydantic schemas for the Messages domain."""

from __future__ import annotations

from app.schemas.common import CamelModel


class MessageCreate(CamelModel):
    lease_id: str | None = None
    content: str


class MessageOut(CamelModel):
    id: str
    organisation_id: str
    lease_id: str | None
    sender_id: str
    sender_name: str
    sender_role: str
    content: str
    read_at: str | None
    created_at: str
    updated_at: str


class MessageWithLeaseOut(MessageOut):
    """Extended schema used in flat org-level listings — same fields, explicit alias."""
    pass


class UnreadCountOut(CamelModel):
    count: int
