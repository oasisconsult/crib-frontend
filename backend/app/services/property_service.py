"""
Business logic for Properties and Units.

All methods take an explicit org_id so the service layer is organisation-scoped
by default — the router passes it from the CurrentUser dependency.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agency_invite import AgencyInvite
from app.models.landlord_invite import LandlordPropertyAccess
from app.models.organisation import Organisation
from app.models.profile import Profile
from app.models.property import (
    Property, Unit,
    UnitStatus, UnitType,
    FurnishedStatus, WaterSource, BackupPower, InternetType, CompoundType,
)
from app.utils.references import build_ref, next_seq
from app.schemas.property import (
    BatchDeleteResult,
    BatchDeleteUnits,
    BatchRenameResult,
    BatchRenameUnits,
    BatchUnitCreate,
    BulkUnitUpdate,
    PropertyCreate,
    PropertyOut,
    PropertyUpdate,
    SingleUnitOverrides,
    UnitCreate,
    UnitOut,
    UnitRulesUpdate,
    UnitUpdate,
)


# ── Serialisers ───────────────────────────────────────────────────────────────

async def _property_out(prop: Property, db: AsyncSession) -> PropertyOut:
    """Build PropertyOut with computed occupancy / revenue fields."""
    total = await db.scalar(
        select(func.count()).where(Unit.property_id == prop.id)
    ) or 0
    occupied = await db.scalar(
        select(func.count()).where(
            Unit.property_id == prop.id, Unit.status == UnitStatus.occupied
        )
    ) or 0
    revenue = await db.scalar(
        select(func.coalesce(func.sum(Unit.monthly_rent), 0)).where(
            Unit.property_id == prop.id, Unit.status == UnitStatus.occupied
        )
    ) or 0.0

    occupancy_rate = round((occupied / total * 100) if total else 0.0, 1)

    org_name = await db.scalar(
        select(Organisation.name).where(Organisation.id == prop.organisation_id)
    )
    is_agency = bool(await db.scalar(
        select(func.count(AgencyInvite.id)).where(
            AgencyInvite.organisation_id == prop.organisation_id,
            AgencyInvite.status == "accepted",
        )
    ))
    owner_profile_id: str | None = None
    if not is_agency:
        _pid = await db.scalar(
            select(Profile.id).where(
                Profile.organisation_id == prop.organisation_id,
                Profile.role == "owner",
                Profile.deleted_at.is_(None),
            ).limit(1)
        )
        owner_profile_id = str(_pid) if _pid else None

    return PropertyOut(
        id=str(prop.id),
        name=prop.name,
        type=prop.type.value,
        status=prop.status.value,
        address=prop.address,
        rules=prop.rules,
        landlord_id=str(prop.organisation_id),
        org_name=org_name,
        is_agency=is_agency,
        owner_profile_id=owner_profile_id,
        description=prop.description,
        cover_image=prop.cover_image,
        images=prop.images or [],
        tags=prop.tags or [],
        amenities=prop.amenities or [],
        currency=prop.currency,
        geocode=prop.geocode,
        is_single_unit=prop.is_single_unit,
        total_floors=prop.total_floors,
        year_built=prop.year_built,
        land_size_acres=prop.land_size_acres,
        has_perimeter_wall=prop.has_perimeter_wall,
        has_gate=prop.has_gate,
        has_guard=prop.has_guard,
        has_cctv=prop.has_cctv,
        total_parking_spaces=prop.total_parking_spaces,
        water_source=prop.water_source.value,
        backup_power=prop.backup_power.value,
        internet_type=prop.internet_type.value,
        compound_type=prop.compound_type.value,
        total_units=total,
        occupied_units=occupied,
        occupancy_rate=occupancy_rate,
        monthly_revenue=float(revenue),
        created_at=prop.created_at.isoformat(),
        updated_at=prop.updated_at.isoformat(),
    )


def _unit_out(unit: Unit) -> UnitOut:
    return UnitOut(
        id=str(unit.id),
        reference=unit.reference,
        property_id=str(unit.property_id),
        name=unit.name,
        type=unit.type.value,
        status=unit.status.value,
        floor=unit.floor,
        area=unit.area,
        monthly_rent=unit.monthly_rent,
        currency=unit.currency,
        bedrooms=unit.bedrooms,
        bathrooms=unit.bathrooms,
        amenities=unit.amenities or [],
        images=unit.images or [],
        notes=unit.notes,
        rules=unit.rules,
        geocode=unit.geocode,
        block=unit.block,
        max_occupants=unit.max_occupants,
        bathroom_type=unit.bathroom_type.value if unit.bathroom_type else "self_contained",
        sitting_rooms=unit.sitting_rooms,
        toilets=unit.toilets,
        is_self_contained=unit.is_self_contained,
        has_kitchen=unit.has_kitchen,
        has_store=unit.has_store,
        has_domestic_quarters=unit.has_domestic_quarters,
        parking_spaces=unit.parking_spaces,
        furnished_status=unit.furnished_status.value,
        water_source=unit.water_source.value if unit.water_source else None,
        current_tenant_id=str(unit.current_tenant_id) if unit.current_tenant_id else None,
        current_lease_id=str(unit.current_lease_id) if unit.current_lease_id else None,
        last_inspection_date=unit.last_inspection_date,
        created_at=unit.created_at.isoformat(),
        updated_at=unit.updated_at.isoformat(),
    )


# ── Property CRUD ─────────────────────────────────────────────────────────────

async def list_properties(
    org_id: uuid.UUID | None,
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
    status_filter: str | None = None,
    type_filter: str | None = None,
    search: str | None = None,
    landlord_profile_id: uuid.UUID | None = None,
    property_id_filter: list[uuid.UUID] | None = None,
) -> dict:
    # org_id=None means superadmin with platform-wide access — no org filter
    if org_id is not None:
        q = select(Property).where(
            Property.organisation_id == org_id,
            Property.deleted_at.is_(None),
        )
    else:
        q = select(Property).where(Property.deleted_at.is_(None))
    if property_id_filter is not None:
        # Direct property UUID filter — used for caretakers (bypasses LandlordPropertyAccess).
        # An empty list means the caretaker has no delegated properties → return nothing.
        q = q.where(Property.id.in_(property_id_filter)) if property_id_filter else q.where(Property.id.is_(None))
    elif landlord_profile_id is not None:
        # Restrict to only properties this landlord has been granted access to
        allowed = select(LandlordPropertyAccess.property_id).where(
            LandlordPropertyAccess.landlord_profile_id == landlord_profile_id
        )
        q = q.where(Property.id.in_(allowed))
    if status_filter:
        q = q.where(Property.status == status_filter)
    if type_filter:
        q = q.where(Property.type == type_filter)
    if search:
        q = q.where(Property.name.ilike(f"%{search}%"))

    total = await db.scalar(select(func.count()).select_from(q.subquery())) or 0
    q = q.order_by(Property.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    props = result.scalars().all()

    data = [await _property_out(p, db) for p in props]
    return {
        "data": data,
        "total": total,
        "page": page,
        "pageSize": page_size,
        "hasNext": (page * page_size) < total,
    }


async def get_property(
    prop_id: uuid.UUID,
    org_id: uuid.UUID | None,
    db: AsyncSession,
    landlord_profile_id: uuid.UUID | None = None,
    property_id_filter: list[uuid.UUID] | None = None,
) -> Property:
    # org_id=None → superadmin, fetch by id only (no org boundary)
    filters = [Property.id == prop_id, Property.deleted_at.is_(None)]
    if org_id is not None:
        filters.append(Property.organisation_id == org_id)
    result = await db.execute(select(Property).where(*filters))
    prop = result.scalar_one_or_none()
    if not prop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found")
    if property_id_filter is not None:
        # Direct list check — used for caretakers.
        if prop_id not in property_id_filter:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found")
    elif landlord_profile_id is not None:
        access = await db.scalar(
            select(LandlordPropertyAccess.property_id).where(
                LandlordPropertyAccess.landlord_profile_id == landlord_profile_id,
                LandlordPropertyAccess.property_id == prop_id,
            )
        )
        if not access:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found")
    return prop


async def create_property(body: PropertyCreate, org_id: uuid.UUID | None, db: AsyncSession) -> PropertyOut:
    prop = Property(
        organisation_id=org_id,
        name=body.name,
        type=body.type,
        status=body.status,
        address=body.address.model_dump(by_alias=True),
        rules=body.rules.model_dump(by_alias=True),
        description=body.description,
        cover_image=body.cover_image,
        images=body.images,
        tags=body.tags,
        amenities=body.amenities,
        currency=body.currency,
        geocode=body.geocode,
        is_single_unit=body.is_single_unit,
        total_floors=body.total_floors,
        year_built=body.year_built,
        land_size_acres=body.land_size_acres,
        has_perimeter_wall=body.has_perimeter_wall,
        has_gate=body.has_gate,
        has_guard=body.has_guard,
        has_cctv=body.has_cctv,
        total_parking_spaces=body.total_parking_spaces,
        water_source=body.water_source,
        backup_power=body.backup_power,
        internet_type=body.internet_type,
        compound_type=body.compound_type,
    )
    db.add(prop)
    await db.flush()

    if body.is_single_unit:
        ov = body.single_unit_overrides
        db.add(Unit(
            property_id=prop.id,
            name="Main Property",
            type=UnitType.studio,
            status=UnitStatus.available,
            monthly_rent=0.0,
            currency=prop.currency,
            bedrooms=ov.bedrooms if ov else 1,
            bathrooms=ov.bathrooms if ov else 1,
            sitting_rooms=ov.sitting_rooms if ov else 1,
            toilets=ov.toilets if ov else 1,
            is_self_contained=ov.is_self_contained if ov else True,
            has_kitchen=ov.has_kitchen if ov else True,
            has_store=ov.has_store if ov else False,
            has_domestic_quarters=ov.has_domestic_quarters if ov else False,
            parking_spaces=ov.parking_spaces if ov else 0,
            furnished_status=ov.furnished_status if ov else FurnishedStatus.unfurnished,
            area=ov.area if ov else None,
            amenities=[],
            images=[],
        ))
        await db.flush()

    await db.refresh(prop)
    return await _property_out(prop, db)


async def update_property(
    prop_id: uuid.UUID, body: PropertyUpdate, org_id: uuid.UUID | None, db: AsyncSession
) -> PropertyOut:
    prop = await get_property(prop_id, org_id, db)

    updates: dict[str, Any] = {k: v for k, v in body.model_dump(exclude_none=True).items()}

    # Nested models need special handling
    if body.address is not None:
        updates["address"] = body.address.model_dump(by_alias=True)
    if body.rules is not None:
        updates["rules"] = body.rules.model_dump(by_alias=True)

    transitioning_to_single = (
        body.is_single_unit is True and not prop.is_single_unit
    )

    for key, val in updates.items():
        setattr(prop, key, val)

    await db.flush()

    # If the property is being converted to single-unit and has no units yet,
    # auto-create the virtual "Main Property" unit.
    if transitioning_to_single:
        unit_count = await db.scalar(
            select(func.count(Unit.id)).where(
                Unit.property_id == prop.id, Unit.deleted_at.is_(None)
            )
        ) or 0
        if unit_count == 0:
            db.add(Unit(
                property_id=prop.id,
                name="Main Property",
                type=UnitType.studio,
                status=UnitStatus.available,
                monthly_rent=0.0,
                currency=prop.currency,
                bedrooms=1,
                bathrooms=1,
                sitting_rooms=1,
                toilets=1,
                is_self_contained=True,
                has_kitchen=True,
                has_store=False,
                has_domestic_quarters=False,
                parking_spaces=0,
                furnished_status=FurnishedStatus.unfurnished,
                amenities=[],
                images=[],
            ))
            await db.flush()

    await db.refresh(prop)
    return await _property_out(prop, db)


async def update_property_rules(
    prop_id: uuid.UUID, rules: dict, org_id: uuid.UUID | None, db: AsyncSession
) -> PropertyOut:
    prop = await get_property(prop_id, org_id, db)
    prop.rules = {**prop.rules, **rules}
    await db.flush()
    await db.refresh(prop)
    return await _property_out(prop, db)


async def delete_property(prop_id: uuid.UUID, org_id: uuid.UUID | None, db: AsyncSession) -> None:
    """
    Soft-delete (archive) a property. Blocked if any unit is occupied or has
    an active lease — you cannot archive a building with active tenants.
    """
    from app.models.lease import Lease, LeaseStatus

    prop = await get_property(prop_id, org_id, db)

    # Block if any unit is occupied
    occupied = await db.scalar(
        select(func.count(Unit.id)).where(
            Unit.property_id == prop_id,
            Unit.status == UnitStatus.occupied,
            Unit.deleted_at.is_(None),
        )
    ) or 0
    if occupied:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot archive property: {occupied} unit(s) are currently occupied. "
                   "Terminate all active leases first.",
        )

    # Block if any active lease exists on this property
    active_leases = await db.scalar(
        select(func.count(Lease.id)).where(
            Lease.property_id == prop_id,
            Lease.status == LeaseStatus.active,
        )
    ) or 0
    if active_leases:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot archive property: {active_leases} active lease(s) exist. "
                   "Terminate all active leases first.",
        )

    # Block if any non-cancelled inspections are active — archiving would break
    # any portal links already sent to inspectors.
    from app.models.inspection import Inspection
    active_inspections = await db.scalar(
        select(func.count(Inspection.id)).where(
            Inspection.property_id == prop_id,
            Inspection.state.notin_(["cancelled", "completed", "approved", "failed"]),
        )
    ) or 0
    if active_inspections:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot archive property: {active_inspections} active inspection(s) exist. "
                   "Cancel or complete all inspections first.",
        )

    prop.deleted_at = datetime.now(timezone.utc)
    # Also soft-delete all units belonging to this property
    await db.execute(
        update(Unit)
        .where(Unit.property_id == prop_id, Unit.deleted_at.is_(None))
        .values(deleted_at=datetime.now(timezone.utc))
    )
    await db.flush()


async def restore_property(prop_id: uuid.UUID, org_id: uuid.UUID | None, db: AsyncSession) -> PropertyOut:
    """Restore a soft-deleted property and all its (also soft-deleted) units."""
    from app.utils.db_filters import org_scope
    q = org_scope(
        select(Property).where(Property.id == prop_id),
        Property.organisation_id, org_id,
    )
    result = await db.execute(q)
    prop = result.scalar_one_or_none()
    if not prop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found")
    if prop.deleted_at is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Property is not archived"
        )

    prop.deleted_at = None
    await db.execute(
        update(Unit)
        .where(Unit.property_id == prop_id)
        .values(deleted_at=None)
    )
    await db.flush()
    await db.refresh(prop)
    return await _property_out(prop, db)


# ── Unit CRUD ─────────────────────────────────────────────────────────────────

async def _get_unit(
    prop_id: uuid.UUID, unit_id: uuid.UUID, org_id: uuid.UUID | None, db: AsyncSession
) -> Unit:
    """Load a unit, verifying it belongs to a property in this org."""
    from app.utils.db_filters import org_scope

    q = org_scope(
        select(Unit)
        .join(Property, Unit.property_id == Property.id)
        .where(
            Unit.id == unit_id,
            Unit.property_id == prop_id,
            Unit.deleted_at.is_(None),          # archived units are not visible
        ),
        Property.organisation_id,
        org_id,
    )
    result = await db.execute(q)
    unit = result.scalar_one_or_none()
    if not unit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unit not found")
    return unit


async def list_units(
    prop_id: uuid.UUID, org_id: uuid.UUID | None, db: AsyncSession,
    page: int = 1, page_size: int = 50,
    status_filter: str | None = None,
) -> dict:
    # Verify property belongs to org
    await get_property(prop_id, org_id, db)

    q = select(Unit).where(
        Unit.property_id == prop_id,
        Unit.deleted_at.is_(None),          # exclude archived units
    )
    if status_filter:
        q = q.where(Unit.status == status_filter)

    total = await db.scalar(select(func.count()).select_from(q.subquery())) or 0
    q = q.order_by(Unit.name).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    units = result.scalars().all()

    return {
        "data": [_unit_out(u) for u in units],
        "total": total,
        "page": page,
        "pageSize": page_size,
        "hasNext": (page * page_size) < total,
    }


async def get_unit(
    prop_id: uuid.UUID, unit_id: uuid.UUID, org_id: uuid.UUID | None, db: AsyncSession
) -> UnitOut:
    unit = await _get_unit(prop_id, unit_id, org_id, db)
    return _unit_out(unit)


async def create_unit(
    prop_id: uuid.UUID, body: UnitCreate, org_id: uuid.UUID | None, db: AsyncSession
) -> UnitOut:
    await get_property(prop_id, org_id, db)  # ownership check

    seq = await next_seq(db, Unit)
    ref = build_ref("UNIT", seq)

    unit = Unit(
        property_id=prop_id,
        name=body.name,
        type=body.type,
        status=body.status,
        floor=body.floor,
        area=body.area,
        monthly_rent=body.monthly_rent,
        currency=body.currency,
        bedrooms=body.bedrooms,
        bathrooms=body.bathrooms,
        amenities=body.amenities,
        images=body.images,
        notes=body.notes,
        rules=body.rules.model_dump(by_alias=True) if body.rules else None,
        reference=ref,
        geocode=body.geocode,
        block=body.block,
        max_occupants=body.max_occupants,
        bathroom_type=body.bathroom_type,
        sitting_rooms=body.sitting_rooms,
        toilets=body.toilets,
        is_self_contained=body.is_self_contained,
        has_kitchen=body.has_kitchen,
        has_store=body.has_store,
        has_domestic_quarters=body.has_domestic_quarters,
        parking_spaces=body.parking_spaces,
        furnished_status=body.furnished_status,
        water_source=body.water_source,
    )
    db.add(unit)
    await db.flush()
    await db.refresh(unit)
    return _unit_out(unit)


async def batch_create_units(
    prop_id: uuid.UUID, body: BatchUnitCreate, org_id: uuid.UUID | None, db: AsyncSession
) -> list[UnitOut]:
    await get_property(prop_id, org_id, db)

    base_seq = await next_seq(db, Unit)
    units = [
        Unit(
            property_id=prop_id,
            name=u.name,
            type=u.type,
            status=u.status,
            floor=u.floor,
            area=u.area,
            monthly_rent=u.monthly_rent,
            currency=u.currency,
            bedrooms=u.bedrooms,
            bathrooms=u.bathrooms,
            amenities=u.amenities,
            images=u.images,
            notes=u.notes,
            rules=u.rules.model_dump(by_alias=True) if u.rules else None,
            reference=build_ref("UNIT", base_seq + i),
            block=u.block,
            max_occupants=u.max_occupants,
            bathroom_type=u.bathroom_type,
            sitting_rooms=u.sitting_rooms,
            toilets=u.toilets,
            is_self_contained=u.is_self_contained,
            has_kitchen=u.has_kitchen,
            has_store=u.has_store,
            has_domestic_quarters=u.has_domestic_quarters,
            parking_spaces=u.parking_spaces,
            furnished_status=u.furnished_status,
            water_source=u.water_source,
        )
        for i, u in enumerate(body.units)
    ]
    db.add_all(units)
    await db.flush()
    for u in units:
        await db.refresh(u)
    return [_unit_out(u) for u in units]


async def update_unit(
    prop_id: uuid.UUID, unit_id: uuid.UUID, body: UnitUpdate,
    org_id: uuid.UUID | None, db: AsyncSession
) -> UnitOut:
    unit = await _get_unit(prop_id, unit_id, org_id, db)

    for key, val in body.model_dump(exclude_none=True).items():
        setattr(unit, key, val)

    await db.flush()
    await db.refresh(unit)
    return _unit_out(unit)


async def update_unit_rules(
    prop_id: uuid.UUID, unit_id: uuid.UUID, body: UnitRulesUpdate,
    org_id: uuid.UUID | None, db: AsyncSession
) -> UnitOut:
    unit = await _get_unit(prop_id, unit_id, org_id, db)
    # rules=None means reset to property inheritance
    unit.rules = body.rules.model_dump(by_alias=True) if body.rules else None
    await db.flush()
    await db.refresh(unit)
    return _unit_out(unit)


async def bulk_update_units(
    prop_id: uuid.UUID, body: BulkUnitUpdate, org_id: uuid.UUID | None, db: AsyncSession
) -> list[UnitOut]:
    await get_property(prop_id, org_id, db)

    unit_uuids = [uuid.UUID(uid) for uid in body.unit_ids]
    updates: dict[str, Any] = {}
    if body.status is not None:
        updates["status"] = body.status
    if body.monthly_rent is not None:
        updates["monthly_rent"] = body.monthly_rent
    if body.amenities is not None:
        updates["amenities"] = body.amenities

    if updates:
        await db.execute(
            update(Unit)
            .where(Unit.id.in_(unit_uuids), Unit.property_id == prop_id)
            .values(**updates)
        )
        await db.flush()

    units_loaded = (await db.execute(
        select(Unit).where(Unit.id.in_(unit_uuids), Unit.property_id == prop_id)
    )).scalars().all()
    for u in units_loaded:
        await db.refresh(u)
    return [_unit_out(u) for u in units_loaded]


async def batch_rename_units(
    prop_id: uuid.UUID, body: BatchRenameUnits, org_id: uuid.UUID | None, db: AsyncSession
) -> BatchRenameResult:
    """Rename a set of units using a sequential prefix pattern (e.g. 'Room 001', 'Room 002')."""
    await get_property(prop_id, org_id, db)

    unit_uuids = [uuid.UUID(uid) for uid in body.unit_ids]
    units = (await db.execute(
        select(Unit)
        .where(Unit.id.in_(unit_uuids), Unit.property_id == prop_id, Unit.deleted_at.is_(None))
        .order_by(Unit.created_at)
    )).scalars().all()

    generated: list[str] = []
    for i, unit in enumerate(units):
        num = body.start_number + i
        name = f"{body.prefix}{body.separator}{str(num).zfill(body.padding)}"
        unit.name = name
        generated.append(name)

    await db.flush()
    return BatchRenameResult(renamed=len(units), names=generated)


async def batch_delete_units(
    prop_id: uuid.UUID, body: BatchDeleteUnits, org_id: uuid.UUID | None, db: AsyncSession
) -> BatchDeleteResult:
    """Soft-delete multiple units. Occupied units are skipped and reported."""
    await get_property(prop_id, org_id, db)

    unit_uuids = [uuid.UUID(uid) for uid in body.unit_ids]
    units = (await db.execute(
        select(Unit)
        .where(Unit.id.in_(unit_uuids), Unit.property_id == prop_id, Unit.deleted_at.is_(None))
    )).scalars().all()

    deleted = 0
    skipped_occupied: list[str] = []
    now = datetime.now(timezone.utc)

    for unit in units:
        if unit.status == UnitStatus.occupied:
            skipped_occupied.append(unit.name)
        else:
            unit.deleted_at = now
            deleted += 1

    await db.flush()
    return BatchDeleteResult(deleted=deleted, skipped_occupied=skipped_occupied)


async def delete_unit(
    prop_id: uuid.UUID, unit_id: uuid.UUID, org_id: uuid.UUID | None, db: AsyncSession
) -> None:
    """Soft-delete (archive) a unit. Blocked if the unit is currently occupied."""
    unit = await _get_unit(prop_id, unit_id, org_id, db)

    if unit.status == UnitStatus.occupied:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot archive unit: it is currently occupied. "
                   "Terminate the active lease first.",
        )

    unit.deleted_at = datetime.now(timezone.utc)
    await db.flush()


async def restore_unit(
    prop_id: uuid.UUID, unit_id: uuid.UUID, org_id: uuid.UUID | None, db: AsyncSession
) -> UnitOut:
    """Restore a soft-deleted unit (superadmin only)."""
    from app.utils.db_filters import org_scope

    q = org_scope(
        select(Unit)
        .join(Property, Unit.property_id == Property.id)
        .where(
            Unit.id == unit_id,
            Unit.property_id == prop_id,
        ),
        Property.organisation_id,
        org_id,
    )
    result = await db.execute(q)
    unit = result.scalar_one_or_none()
    if not unit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unit not found")
    if unit.deleted_at is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Unit is not archived")

    unit.deleted_at = None
    await db.flush()
    await db.refresh(unit)
    return _unit_out(unit)
