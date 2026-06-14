"""
Inspection and MaintenanceIssue models.

State machines:
  Inspection:       scheduled → in_progress → completed → approved
                              ↘ failed / cancelled (from most states)
  MaintenanceIssue: reported → assigned → in_progress → resolved → closed
                             ↘ cancelled (from most states)
"""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TimestampedBase


# ── Enums ──────────────────────────────────────────────────────────────────────

class InspectionType(str, enum.Enum):
    move_in     = "move_in"
    move_out    = "move_out"
    routine     = "routine"
    maintenance = "maintenance"
    complaint   = "complaint"


class InspectionState(str, enum.Enum):
    scheduled   = "scheduled"
    in_progress = "in_progress"
    completed   = "completed"
    approved    = "approved"
    failed      = "failed"
    cancelled   = "cancelled"


class MaintenanceReporter(str, enum.Enum):
    tenant    = "tenant"
    landlord  = "landlord"
    inspector = "inspector"


class MaintenanceCategory(str, enum.Enum):
    plumbing   = "plumbing"
    electrical = "electrical"
    structural = "structural"
    appliance  = "appliance"
    pest       = "pest"
    security   = "security"
    other      = "other"


class MaintenancePriority(str, enum.Enum):
    low    = "low"
    medium = "medium"
    high   = "high"
    urgent = "urgent"


class MaintenanceState(str, enum.Enum):
    reported    = "reported"
    assigned    = "assigned"
    in_progress = "in_progress"
    resolved    = "resolved"
    closed      = "closed"
    cancelled   = "cancelled"


# ── Valid state transitions ────────────────────────────────────────────────────

INSPECTION_TRANSITIONS: dict[str, list[str]] = {
    InspectionState.scheduled:   [InspectionState.in_progress, InspectionState.cancelled],
    InspectionState.in_progress: [InspectionState.completed, InspectionState.failed],
    InspectionState.completed:   [InspectionState.approved, InspectionState.failed],
    InspectionState.failed:      [InspectionState.scheduled],   # reschedule
    InspectionState.cancelled:   [InspectionState.scheduled],   # reschedule
    InspectionState.approved:    [],
}

MAINTENANCE_TRANSITIONS: dict[str, list[str]] = {
    MaintenanceState.reported:    [MaintenanceState.assigned, MaintenanceState.cancelled],
    MaintenanceState.assigned:    [MaintenanceState.in_progress, MaintenanceState.cancelled],
    MaintenanceState.in_progress: [MaintenanceState.resolved, MaintenanceState.cancelled],
    MaintenanceState.resolved:    [MaintenanceState.closed],
    MaintenanceState.closed:      [],
    MaintenanceState.cancelled:   [],
}


# ── Models ─────────────────────────────────────────────────────────────────────

class Inspection(TimestampedBase):
    __tablename__ = "inspections"

    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organisations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    property_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    unit_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("units.id", ondelete="SET NULL"),
        nullable=True,
    )
    lease_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("leases.id", ondelete="SET NULL"),
        nullable=True,
    )
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    inspector_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    inspector_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    reference: Mapped[str | None] = mapped_column(String(40), nullable=True, unique=True, index=True)

    type: Mapped[str] = mapped_column(String(20), nullable=False)
    state: Mapped[str] = mapped_column(String(20), nullable=False, default="scheduled", index=True)

    scheduled_date: Mapped[date] = mapped_column(Date(), nullable=False, index=True)
    scheduled_time_slot: Mapped[str | None] = mapped_column(String(50), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    checklist: Mapped[list] = mapped_column(JSONB(), nullable=False, default=list)
    overall_condition: Mapped[str | None] = mapped_column(String(20), nullable=True)
    summary: Mapped[str | None] = mapped_column(Text(), nullable=True)
    recommendations: Mapped[str | None] = mapped_column(Text(), nullable=True)

    photo_urls: Mapped[list] = mapped_column(JSONB(), nullable=False, default=list)
    video_urls: Mapped[list] = mapped_column(JSONB(), nullable=False, default=list)
    maintenance_issue_ids: Mapped[list] = mapped_column(JSONB(), nullable=False, default=list)

    tenant_signed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    landlord_signed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    sign_token: Mapped[str | None] = mapped_column(String(128), nullable=True, unique=True, index=True)
    sign_token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    landlord_signed_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    report_pdf_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    baseline_inspection_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inspections.id", ondelete="SET NULL"),
        nullable=True,
    )

    def __repr__(self) -> str:
        return f"<Inspection property={self.property_id} type={self.type} state={self.state}>"


class MaintenanceIssue(TimestampedBase):
    __tablename__ = "maintenance_issues"

    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organisations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    property_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    unit_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("units.id", ondelete="SET NULL"),
        nullable=True,
    )
    lease_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("leases.id", ondelete="SET NULL"),
        nullable=True,
    )
    inspection_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inspections.id", ondelete="SET NULL"),
        nullable=True,
    )

    reported_by: Mapped[str] = mapped_column(String(20), nullable=False)
    reported_by_id: Mapped[str] = mapped_column(String(255), nullable=False)

    reference: Mapped[str | None] = mapped_column(String(40), nullable=True, unique=True, index=True)

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text(), nullable=False)
    category: Mapped[str] = mapped_column(String(20), nullable=False)
    priority: Mapped[str] = mapped_column(String(10), nullable=False, default="medium", index=True)
    state: Mapped[str] = mapped_column(String(20), nullable=False, default="reported", index=True)

    assigned_to: Mapped[str | None] = mapped_column(String(255), nullable=True)
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    estimated_cost: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    actual_cost: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="UGX")

    reported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    photo_urls: Mapped[list] = mapped_column(JSONB(), nullable=False, default=list)
    notes: Mapped[str | None] = mapped_column(Text(), nullable=True)

    def __repr__(self) -> str:
        return f"<MaintenanceIssue property={self.property_id} title={self.title!r} state={self.state}>"
