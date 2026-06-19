"""Audit log Pydantic schemas."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from app.schemas.common import CamelModel


class AuditLogOut(CamelModel):
    id: uuid.UUID
    organisation_id: uuid.UUID | None
    actor_id: uuid.UUID | None
    actor_role: str | None
    actor_name: str | None          # resolved from profiles join in service layer
    resource_type: str
    resource_id: uuid.UUID | None
    resource_label: str | None
    action: str
    changes: dict[str, Any]         # { field: { before, after } }
    event_data: dict[str, Any]
    ip_address: str | None
    request_id: str | None
    created_at: datetime


class AuditLogListOut(CamelModel):
    data: list[AuditLogOut]
    total: int
    page: int
    page_size: int
