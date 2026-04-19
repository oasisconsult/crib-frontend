"""Pydantic schemas for the inspections and maintenance domains."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from pydantic import Field

from app.schemas.common import CamelModel


# ── Checklist ──────────────────────────────────────────────────────────────────

class ChecklistItemIn(CamelModel):
    id: str
    area: str
    description: str
    condition: str | None = None
    notes: str | None = None
    photo_urls: list[str] = Field(default_factory=list)
    required: bool = True


# ── Inspection ─────────────────────────────────────────────────────────────────

class InspectionCreate(CamelModel):
    property_id: str
    unit_id: str | None = None
    lease_id: str | None = None
    tenant_id: str | None = None
    inspector_id: str | None = None
    inspector_name: str | None = None
    type: str
    scheduled_date: date
    scheduled_time_slot: str | None = None
    checklist: list[dict[str, Any]] = Field(default_factory=list)


class InspectionUpdate(CamelModel):
    inspector_id: str | None = None
    inspector_name: str | None = None
    scheduled_date: date | None = None
    scheduled_time_slot: str | None = None
    checklist: list[dict[str, Any]] | None = None
    overall_condition: str | None = None
    summary: str | None = None
    recommendations: str | None = None
    notes: str | None = None


class InspectionTransition(CamelModel):
    event: str  # INSPECTION_STARTED, INSPECTION_COMPLETED, etc.


class InspectionPhotos(CamelModel):
    urls: list[str]


class InspectionOut(CamelModel):
    id: str
    reference: str | None = None
    organisation_id: str
    property_id: str
    unit_id: str | None
    lease_id: str | None
    tenant_id: str | None
    inspector_id: str | None
    inspector_name: str | None
    type: str
    state: str
    scheduled_date: str
    scheduled_time_slot: str | None
    started_at: str | None
    completed_at: str | None
    approved_at: str | None
    checklist: list[dict[str, Any]]
    overall_condition: str | None
    summary: str | None
    recommendations: str | None
    photo_urls: list[str]
    video_urls: list[str]
    maintenance_issue_ids: list[str]
    tenant_signed_at: str | None
    landlord_signed_at: str | None
    created_at: str
    updated_at: str
    # Denormalised display names
    unit_name: str | None = None
    property_name: str | None = None


# ── Maintenance ────────────────────────────────────────────────────────────────

class MaintenanceCreate(CamelModel):
    property_id: str
    unit_id: str | None = None
    lease_id: str | None = None
    inspection_id: str | None = None
    reported_by: str
    reported_by_id: str
    title: str
    description: str
    category: str
    priority: str = "medium"
    estimated_cost: float | None = None
    currency: str = "UGX"
    photo_urls: list[str] = Field(default_factory=list)
    notes: str | None = None


class MaintenanceUpdate(CamelModel):
    title: str | None = None
    description: str | None = None
    category: str | None = None
    priority: str | None = None
    assigned_to: str | None = None
    estimated_cost: float | None = None
    actual_cost: float | None = None
    currency: str | None = None
    notes: str | None = None
    photo_urls: list[str] | None = None


class MaintenanceTransition(CamelModel):
    event: str  # ISSUE_ASSIGNED, ISSUE_STARTED, ISSUE_RESOLVED, ISSUE_CLOSED, ISSUE_CANCELLED
    assigned_to: str | None = None  # required for ISSUE_ASSIGNED


class MaintenanceOut(CamelModel):
    id: str
    reference: str | None = None
    organisation_id: str
    property_id: str
    unit_id: str | None
    lease_id: str | None
    inspection_id: str | None
    reported_by: str
    reported_by_id: str
    title: str
    description: str
    category: str
    priority: str
    state: str
    assigned_to: str | None
    assigned_at: str | None
    estimated_cost: float | None
    actual_cost: float | None
    currency: str
    reported_at: str
    started_at: str | None
    resolved_at: str | None
    closed_at: str | None
    photo_urls: list[str]
    notes: str | None
    created_at: str
    updated_at: str
    # Denormalised display names
    property_name: str | None = None
    unit_name: str | None = None
