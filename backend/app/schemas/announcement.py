"""Announcement schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import Field

from app.schemas.common import CamelModel


class AnnouncementCreate(CamelModel):
    title: str = Field(..., min_length=1, max_length=255)
    body: str = Field(..., min_length=1)
    # Subset of ["in_app", "email", "sms", "whatsapp"]; defaults to in_app only
    channels: list[str] = Field(default_factory=lambda: ["in_app"])


class AnnouncementOut(CamelModel):
    id: uuid.UUID
    organisation_id: uuid.UUID
    title: str
    body: str
    channels: list[str]
    target_audience: str
    sent_to_count: int
    created_by_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
