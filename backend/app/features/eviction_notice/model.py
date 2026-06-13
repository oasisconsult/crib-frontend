"""SQLAlchemy model for eviction notices (Uganda LTA 2022, §§ 73-78)."""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime

import sqlalchemy as sa
from sqlalchemy import Date, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TimestampedBase


class EvictionNoticeType(str, enum.Enum):
    non_payment  = "non_payment"   # failure to pay rent — 14-day minimum notice
    breach       = "breach"        # breach of tenancy terms — 14-day minimum notice
    end_of_term  = "end_of_term"   # periodic tenancy ending — 30-day minimum notice
    redevelopment = "redevelopment" # demolition/major works — 180-day minimum notice


class EvictionNoticeStatus(str, enum.Enum):
    issued    = "issued"    # notice created, not yet physically delivered
    served    = "served"    # landlord confirmed physical delivery to tenant
    disputed  = "disputed"  # tenant formally disputes the notice
    withdrawn = "withdrawn" # landlord withdraws the notice
    executed  = "executed"  # eviction carried out (after effective_date)


class EvictionNotice(TimestampedBase):
    """
    A formal eviction notice under Uganda Landlord & Tenant Act 2022, §§ 73-78.

    Status transitions:
        issued → served | disputed | withdrawn
        served → disputed | withdrawn | executed (only after effective_date)
        disputed, withdrawn, executed → terminal

    LTA minimum notice periods enforced at service layer:
        non_payment / breach: 14 days
        end_of_term:          30 days
        redevelopment:        180 days
    """
    __tablename__ = "eviction_notices"

    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organisations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    lease_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("leases.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    property_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("properties.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    unit_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("units.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    issued_by: Mapped[str] = mapped_column(String(255), nullable=False)

    notice_type: Mapped[EvictionNoticeType] = mapped_column(
        sa.Enum(
            EvictionNoticeType,
            name="eviction_notice_type_enum",
            create_type=False,
        ),
        nullable=False,
        index=True,
    )
    status: Mapped[EvictionNoticeStatus] = mapped_column(
        sa.Enum(
            EvictionNoticeStatus,
            name="eviction_notice_status_enum",
            create_type=False,
        ),
        nullable=False,
        default=EvictionNoticeStatus.issued,
        index=True,
    )

    reason: Mapped[str] = mapped_column(Text, nullable=False)
    effective_date: Mapped[date] = mapped_column(Date, nullable=False)
    court_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)

    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    served_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    disputed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    withdrawn_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    notice_pdf_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:  # pragma: no cover
        return f"<EvictionNotice lease={self.lease_id} type={self.notice_type} {self.status}>"
