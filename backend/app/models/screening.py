"""Tenant screening checklist model."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TimestampedBase

DEFAULT_CHECKLIST = [
    {"key": "id_verified",          "label": "National ID / Passport verified",           "checked": False, "notes": None},
    {"key": "employment_verified",  "label": "Employment letter or payslip received",      "checked": False, "notes": None},
    {"key": "income_sufficient",    "label": "Monthly income ≥ 3× rent confirmed",         "checked": False, "notes": None},
    {"key": "prev_landlord_ref",    "label": "Previous landlord reference checked",        "checked": False, "notes": None},
    {"key": "guarantor_confirmed",  "label": "Guarantor confirmed and documented",         "checked": False, "notes": None},
    {"key": "nin_verified",         "label": "NIRA National ID number verified",           "checked": False, "notes": None},
]


class TenantScreening(TimestampedBase):
    __tablename__ = "tenant_screenings"

    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organisations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    unit_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("units.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # Linked to an existing tenant record when the applicant is already in the system
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="SET NULL"),
        nullable=True,
    )

    applicant_name: Mapped[str] = mapped_column(String(200), nullable=False)
    applicant_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    applicant_email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # pending | approved | rejected
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")

    # [{key, label, checked, notes}]
    checklist: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    decision_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    decided_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    decided_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
