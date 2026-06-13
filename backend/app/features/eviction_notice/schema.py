"""Pydantic schemas for eviction notice endpoints."""

from __future__ import annotations

from datetime import date

from pydantic import Field

from app.schemas.common import CamelModel


class EvictionNoticeCreate(CamelModel):
    notice_type: str = Field(description="non_payment | breach | end_of_term | redevelopment")
    reason: str = Field(min_length=10, max_length=2000, description="Specific grounds for eviction")
    effective_date: date = Field(description="Date by which the tenant must vacate")
    court_reference: str | None = Field(default=None, max_length=255)
    notes: str | None = Field(default=None, max_length=1000)


class EvictionNoticeDisputeBody(CamelModel):
    grounds: str | None = Field(default=None, max_length=1000)


class EvictionNoticeWithdrawBody(CamelModel):
    reason: str | None = Field(default=None, max_length=500)


class EvictionNoticeOut(CamelModel):
    id: str
    organisation_id: str
    lease_id: str
    property_id: str | None
    unit_id: str | None
    tenant_id: str | None
    issued_by: str
    notice_type: str
    status: str
    reason: str
    effective_date: str
    court_reference: str | None
    issued_at: str
    served_at: str | None
    disputed_at: str | None
    withdrawn_at: str | None
    executed_at: str | None
    notice_pdf_url: str | None
    notes: str | None
    created_at: str
    updated_at: str


class EvictionNoticeListOut(CamelModel):
    data: list[EvictionNoticeOut]
    total: int
