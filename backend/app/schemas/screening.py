from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import EmailStr, field_validator

from app.schemas.common import CamelModel


class ChecklistItemUpdate(CamelModel):
    key: str
    checked: bool
    notes: str | None = None


class ScreeningCreate(CamelModel):
    applicant_name: str
    applicant_phone: str | None = None
    applicant_email: EmailStr | None = None
    unit_id: uuid.UUID | None = None
    tenant_id: uuid.UUID | None = None
    notes: str | None = None

    @field_validator("applicant_name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("applicant_name must not be blank")
        return v.strip()


class ScreeningUpdate(CamelModel):
    applicant_name: str | None = None
    applicant_phone: str | None = None
    applicant_email: EmailStr | None = None
    notes: str | None = None
    checklist: list[ChecklistItemUpdate] | None = None


class ScreeningDecide(CamelModel):
    decision: str  # "approved" | "rejected"
    notes: str | None = None

    @field_validator("decision")
    @classmethod
    def valid_decision(cls, v: str) -> str:
        if v not in ("approved", "rejected"):
            raise ValueError("decision must be 'approved' or 'rejected'")
        return v


class ScreeningOut(CamelModel):
    id: uuid.UUID
    organisation_id: uuid.UUID
    unit_id: uuid.UUID | None
    tenant_id: uuid.UUID | None
    applicant_name: str
    applicant_phone: str | None
    applicant_email: str | None
    status: str
    checklist: list[Any]
    notes: str | None
    decision_notes: str | None
    created_by_id: uuid.UUID | None
    decided_by_id: uuid.UUID | None
    decided_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
