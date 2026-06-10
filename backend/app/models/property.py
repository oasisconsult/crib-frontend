"""
Property and Unit models.

Hierarchy: Organisation → Property → Unit

Rules live as JSONB on Property and can be overridden at Unit level.
When a Unit's `rules` column is NULL it inherits from the parent Property.

Computed fields (occupancy_rate, monthly_revenue) are derived at query time,
not stored as columns.
"""

import enum
import uuid

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import TimestampedBase


class PropertyType(str, enum.Enum):
    flat = "flat"
    house = "house"
    hostel = "hostel"
    commercial = "commercial"
    villa = "villa"


class PropertyStatus(str, enum.Enum):
    active = "active"
    inactive = "inactive"
    maintenance = "maintenance"


class UnitType(str, enum.Enum):
    single = "single"
    double = "double"
    studio = "studio"
    ensuite = "ensuite"
    shared = "shared"


class UnitStatus(str, enum.Enum):
    available = "available"
    occupied = "occupied"
    reserved = "reserved"
    maintenance = "maintenance"


class Property(TimestampedBase):
    __tablename__ = "properties"

    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organisations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[PropertyType] = mapped_column(
        Enum(PropertyType, name="property_type_enum"), nullable=False
    )
    status: Mapped[PropertyStatus] = mapped_column(
        Enum(PropertyStatus, name="property_status_enum"),
        nullable=False,
        default=PropertyStatus.active,
    )

    # Address stored as JSONB — flexible for international formats
    address: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Property-level rules (inherited by units unless overridden)
    rules: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    cover_image: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    images: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    tags: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    amenities: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="UGX")
    geocode: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Soft-delete — NULL = active, non-NULL = archived (recoverable by superadmin)
    # Blocked when any unit is occupied or has an active lease.
    deleted_at: Mapped[DateTime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )

    # Relationships
    units: Mapped[list["Unit"]] = relationship(
        "Unit", back_populates="property", cascade="all, delete-orphan", lazy="select"
    )

    def __repr__(self) -> str:
        return f"<Property {self.name!r} type={self.type}>"


class Unit(TimestampedBase):
    __tablename__ = "units"

    property_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    reference: Mapped[str | None] = mapped_column(String(40), nullable=True, unique=True, index=True)

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    type: Mapped[UnitType] = mapped_column(
        Enum(UnitType, name="unit_type_enum"), nullable=False
    )
    status: Mapped[UnitStatus] = mapped_column(
        Enum(UnitStatus, name="unit_status_enum"),
        nullable=False,
        default=UnitStatus.available,
    )

    floor: Mapped[int | None] = mapped_column(Integer, nullable=True)
    area: Mapped[float | None] = mapped_column(Float, nullable=True)  # sqm
    monthly_rent: Mapped[float] = mapped_column(Float, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="UGX")
    bedrooms: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    bathrooms: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    amenities: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    images: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    geocode: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Per-unit rule overrides; NULL means inherit from property
    rules: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Cached FKs — updated when a lease is activated/closed
    current_tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="SET NULL"),
        nullable=True,
    )
    current_lease_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    last_inspection_date: Mapped[str | None] = mapped_column(String(30), nullable=True)

    # Soft-delete — NULL = active, non-NULL = archived. Blocked when occupied.
    deleted_at: Mapped[DateTime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )

    # Relationships
    property: Mapped[Property] = relationship("Property", back_populates="units")

    def __repr__(self) -> str:
        return f"<Unit {self.name!r} status={self.status}>"
