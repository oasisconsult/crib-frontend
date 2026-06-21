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
    bungalow = "bungalow"
    maisonette = "maisonette"
    townhouse = "townhouse"
    bedsitter_block = "bedsitter_block"


class PropertyStatus(str, enum.Enum):
    active = "active"
    inactive = "inactive"
    maintenance = "maintenance"


class UnitType(str, enum.Enum):
    # Legacy values — still valid in DB; not shown in UI dropdowns for new units
    single = "single"
    double = "double"
    ensuite = "ensuite"
    shared = "shared"
    # Current Uganda bedroom-count labels
    studio = "studio"
    bedsitter = "bedsitter"
    one_bed = "one_bed"
    two_bed = "two_bed"
    three_bed = "three_bed"
    four_bed_plus = "four_bed_plus"


class BathroomType(str, enum.Enum):
    self_contained = "self_contained"  # private bathroom inside the unit
    semi_shared    = "semi_shared"     # own toilet, shared shower
    communal       = "communal"        # all facilities shared


class UnitStatus(str, enum.Enum):
    available = "available"
    occupied = "occupied"
    reserved = "reserved"
    maintenance = "maintenance"


class FurnishedStatus(str, enum.Enum):
    unfurnished = "unfurnished"
    semi_furnished = "semi_furnished"
    furnished = "furnished"


class WaterSource(str, enum.Enum):
    municipal = "municipal"
    borehole = "borehole"
    tank = "tank"
    multiple = "multiple"


class BackupPower(str, enum.Enum):
    none = "none"
    solar = "solar"
    generator = "generator"
    both = "both"


class InternetType(str, enum.Enum):
    none = "none"
    wifi = "wifi"
    fibre = "fibre"


class CompoundType(str, enum.Enum):
    private = "private"
    shared = "shared"


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
    is_single_unit: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # ── Uganda property features ───────────────────────────────────────────────
    total_floors: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    year_built: Mapped[int | None] = mapped_column(Integer, nullable=True)
    land_size_acres: Mapped[float | None] = mapped_column(Float, nullable=True)
    has_perimeter_wall: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    has_gate: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    has_guard: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    has_cctv: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    total_parking_spaces: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    water_source: Mapped[WaterSource] = mapped_column(
        Enum(WaterSource, name="water_source_enum"),
        nullable=False,
        default=WaterSource.municipal,
    )
    backup_power: Mapped[BackupPower] = mapped_column(
        Enum(BackupPower, name="backup_power_enum"),
        nullable=False,
        default=BackupPower.none,
    )
    internet_type: Mapped[InternetType] = mapped_column(
        Enum(InternetType, name="internet_type_enum"),
        nullable=False,
        default=InternetType.none,
    )
    compound_type: Mapped[CompoundType] = mapped_column(
        Enum(CompoundType, name="compound_type_enum"),
        nullable=False,
        default=CompoundType.private,
    )

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

    # Block / occupancy / bathroom classification ─────────────────────────────
    block: Mapped[str | None] = mapped_column(String(100), nullable=True)
    max_occupants: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    bathroom_type: Mapped[BathroomType] = mapped_column(
        Enum(BathroomType, name="bathroom_type_enum"),
        nullable=False,
        default=BathroomType.self_contained,
    )

    # ── Uganda unit features ───────────────────────────────────────────────────
    sitting_rooms: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    toilets: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    is_self_contained: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    has_kitchen: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    has_store: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    has_domestic_quarters: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    parking_spaces: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    furnished_status: Mapped[FurnishedStatus] = mapped_column(
        Enum(FurnishedStatus, name="furnished_status_enum"),
        nullable=False,
        default=FurnishedStatus.unfurnished,
    )
    # NULL means inherit water source from parent property
    water_source: Mapped[WaterSource | None] = mapped_column(
        Enum(WaterSource, name="water_source_enum"),
        nullable=True,
    )

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
