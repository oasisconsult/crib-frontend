"""
Public vacancy listings endpoint — no authentication required.

Organisations opt in to public listings by setting
Organisation.settings['listings_enabled'] = True.
Contact info for inquiries is pulled from Organisation.settings:
  listings_contact_phone   — WhatsApp/phone number for inquiries
  listings_contact_email   — email for inquiries

Endpoints:
  GET /public/listings  — paginated available units across all opted-in orgs
"""

from __future__ import annotations

import uuid as _uuid
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.organisation import Organisation
from app.models.property import Property, PropertyStatus, Unit, UnitStatus

public_router = APIRouter(prefix="/public", tags=["listings"])


class ListingAddressOut(BaseModel):
    line1: str | None = None
    city: str | None = None
    parish: str | None = None
    district: str | None = None

    model_config = {"from_attributes": True}


class ListingOut(BaseModel):
    unit_id: str
    unit_name: str
    unit_type: str
    monthly_rent: float
    currency: str
    bedrooms: int
    bathrooms: int
    area: float | None
    furnished_status: str
    amenities: list[Any]
    unit_images: list[Any]
    geocode: str | None

    property_id: str
    property_name: str
    property_type: str
    cover_image: str | None
    property_images: list[Any]
    address: ListingAddressOut
    property_amenities: list[Any]

    org_id: str
    org_name: str
    org_contact_phone: str | None
    org_contact_email: str | None

    model_config = {"from_attributes": True}


class ListingsResponse(BaseModel):
    items: list[ListingOut]
    total: int
    page: int
    page_size: int


@public_router.get("/listings", response_model=ListingsResponse)
async def get_listings(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    unit_type: str | None = Query(None),
    min_rent: float | None = Query(None),
    max_rent: float | None = Query(None),
    district: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> ListingsResponse:
    """
    Return available units from organisations that have opted in to public listings.
    No authentication required — publicly browsable vacancy board.
    """
    result = await db.execute(
        select(Unit, Property, Organisation)
        .join(Property, Unit.property_id == Property.id)
        .join(Organisation, Property.organisation_id == Organisation.id)
        .where(
            Unit.status == UnitStatus.available,
            Unit.deleted_at.is_(None),
            Property.deleted_at.is_(None),
            Property.status == PropertyStatus.active,
            Organisation.is_active.is_(True),
            Organisation.deleted_at.is_(None),
            Organisation.settings["listings_enabled"].astext == "true",
        )
    )
    rows = result.all()

    # Apply optional filters in Python (avoid complex JSONB casting in SQL for now)
    def _matches(unit: Unit, prop: Property) -> bool:
        if unit_type and unit.type.value != unit_type:
            return False
        if min_rent is not None and unit.monthly_rent < min_rent:
            return False
        if max_rent is not None and unit.monthly_rent > max_rent:
            return False
        if district:
            addr = prop.address or {}
            if district.lower() not in (addr.get("district") or "").lower():
                return False
        return True

    filtered = [(u, p, o) for u, p, o in rows if _matches(u, p)]
    total = len(filtered)
    start = (page - 1) * page_size
    page_rows = filtered[start : start + page_size]

    items: list[ListingOut] = []
    for unit, prop, org in page_rows:
        addr = prop.address or {}
        items.append(
            ListingOut(
                unit_id=str(unit.id),
                unit_name=unit.name,
                unit_type=unit.type.value,
                monthly_rent=unit.monthly_rent,
                currency=unit.currency,
                bedrooms=unit.bedrooms,
                bathrooms=unit.bathrooms,
                area=unit.area,
                furnished_status=unit.furnished_status.value,
                amenities=unit.amenities or [],
                unit_images=unit.images or [],
                geocode=unit.geocode or prop.geocode,
                property_id=str(prop.id),
                property_name=prop.name,
                property_type=prop.type.value,
                cover_image=prop.cover_image,
                property_images=prop.images or [],
                address=ListingAddressOut(
                    line1=addr.get("line1"),
                    city=addr.get("city"),
                    parish=addr.get("parish"),
                    district=addr.get("district"),
                ),
                property_amenities=prop.amenities or [],
                org_id=str(org.id),
                org_name=org.name,
                org_contact_phone=org.settings.get("listings_contact_phone"),
                org_contact_email=org.settings.get("listings_contact_email"),
            )
        )

    return ListingsResponse(items=items, total=total, page=page, page_size=page_size)
