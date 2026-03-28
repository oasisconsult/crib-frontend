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

from app.models.property import Property, Unit, UnitStatus
from app.schemas.property import (
    BatchUnitCreate,
    BulkUnitUpdate,
    PropertyCreate,
    PropertyOut,
    PropertyUpdate,
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

    return PropertyOut(
        id=str(prop.id),
        name=prop.name,
        type=prop.type.value,
        status=prop.status.value,
        address=prop.address,
        rules=prop.rules,
        landlord_id=str(prop.organisation_id),
        description=prop.description,
        cover_image=prop.cover_image,
        images=prop.images or [],
        tags=prop.tags or [],
        amenities=prop.amenities or [],
        currency=prop.currency,
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
        current_tenant_id=str(unit.current_tenant_id) if unit.current_tenant_id else None,
        current_lease_id=str(unit.current_lease_id) if unit.current_lease_id else None,
        last_inspection_date=unit.last_inspection_date,
        created_at=unit.created_at.isoformat(),
        updated_at=unit.updated_at.isoformat(),
    )


# ── Property CRUD ─────────────────────────────────────────────────────────────

async def list_properties(
    org_id: uuid.UUID,
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
    status_filter: str | None = None,
    type_filter: str | None = None,
    search: str | None = None,
) -> dict:
    q = select(Property).where(Property.organisation_id == org_id)
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


async def get_property(prop_id: uuid.UUID, org_id: uuid.UUID, db: AsyncSession) -> Property:
    result = await db.execute(
        select(Property).where(Property.id == prop_id, Property.organisation_id == org_id)
    )
    prop = result.scalar_one_or_none()
    if not prop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found")
    return prop


async def create_property(body: PropertyCreate, org_id: uuid.UUID, db: AsyncSession) -> PropertyOut:
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
    )
    db.add(prop)
    await db.flush()
    return await _property_out(prop, db)


async def update_property(
    prop_id: uuid.UUID, body: PropertyUpdate, org_id: uuid.UUID, db: AsyncSession
) -> PropertyOut:
    prop = await get_property(prop_id, org_id, db)

    updates: dict[str, Any] = {k: v for k, v in body.model_dump(exclude_none=True).items()}

    # Nested models need special handling
    if body.address is not None:
        updates["address"] = body.address.model_dump(by_alias=True)
    if body.rules is not None:
        updates["rules"] = body.rules.model_dump(by_alias=True)

    for key, val in updates.items():
        setattr(prop, key, val)

    await db.flush()
    return await _property_out(prop, db)


async def update_property_rules(
    prop_id: uuid.UUID, rules: dict, org_id: uuid.UUID, db: AsyncSession
) -> PropertyOut:
    prop = await get_property(prop_id, org_id, db)
    prop.rules = {**prop.rules, **rules}
    await db.flush()
    return await _property_out(prop, db)


async def delete_property(prop_id: uuid.UUID, org_id: uuid.UUID, db: AsyncSession) -> None:
    prop = await get_property(prop_id, org_id, db)
    await db.delete(prop)
    await db.flush()


# ── Unit CRUD ─────────────────────────────────────────────────────────────────

async def _get_unit(
    prop_id: uuid.UUID, unit_id: uuid.UUID, org_id: uuid.UUID, db: AsyncSession
) -> Unit:
    """Load a unit, verifying it belongs to a property in this org."""
    result = await db.execute(
        select(Unit)
        .join(Property, Unit.property_id == Property.id)
        .where(
            Unit.id == unit_id,
            Unit.property_id == prop_id,
            Property.organisation_id == org_id,
        )
    )
    unit = result.scalar_one_or_none()
    if not unit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unit not found")
    return unit


async def list_units(
    prop_id: uuid.UUID, org_id: uuid.UUID, db: AsyncSession,
    page: int = 1, page_size: int = 50,
    status_filter: str | None = None,
) -> dict:
    # Verify property belongs to org
    await get_property(prop_id, org_id, db)

    q = select(Unit).where(Unit.property_id == prop_id)
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
    prop_id: uuid.UUID, unit_id: uuid.UUID, org_id: uuid.UUID, db: AsyncSession
) -> UnitOut:
    unit = await _get_unit(prop_id, unit_id, org_id, db)
    return _unit_out(unit)


async def create_unit(
    prop_id: uuid.UUID, body: UnitCreate, org_id: uuid.UUID, db: AsyncSession
) -> UnitOut:
    await get_property(prop_id, org_id, db)  # ownership check

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
    )
    db.add(unit)
    await db.flush()
    return _unit_out(unit)


async def batch_create_units(
    prop_id: uuid.UUID, body: BatchUnitCreate, org_id: uuid.UUID, db: AsyncSession
) -> list[UnitOut]:
    await get_property(prop_id, org_id, db)

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
        )
        for u in body.units
    ]
    db.add_all(units)
    await db.flush()
    return [_unit_out(u) for u in units]


async def update_unit(
    prop_id: uuid.UUID, unit_id: uuid.UUID, body: UnitUpdate,
    org_id: uuid.UUID, db: AsyncSession
) -> UnitOut:
    unit = await _get_unit(prop_id, unit_id, org_id, db)

    for key, val in body.model_dump(exclude_none=True).items():
        setattr(unit, key, val)

    await db.flush()
    return _unit_out(unit)


async def update_unit_rules(
    prop_id: uuid.UUID, unit_id: uuid.UUID, body: UnitRulesUpdate,
    org_id: uuid.UUID, db: AsyncSession
) -> UnitOut:
    unit = await _get_unit(prop_id, unit_id, org_id, db)
    # rules=None means reset to property inheritance
    unit.rules = body.rules.model_dump(by_alias=True) if body.rules else None
    await db.flush()
    return _unit_out(unit)


async def bulk_update_units(
    prop_id: uuid.UUID, body: BulkUnitUpdate, org_id: uuid.UUID, db: AsyncSession
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

    result = await db.execute(
        select(Unit).where(Unit.id.in_(unit_uuids), Unit.property_id == prop_id)
    )
    return [_unit_out(u) for u in result.scalars().all()]


async def delete_unit(
    prop_id: uuid.UUID, unit_id: uuid.UUID, org_id: uuid.UUID, db: AsyncSession
) -> None:
    unit = await _get_unit(prop_id, unit_id, org_id, db)
    await db.delete(unit)
    await db.flush()
