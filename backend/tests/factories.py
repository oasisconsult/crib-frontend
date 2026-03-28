"""
Test data factories.

Uses plain functions (not factory-boy) to keep things lightweight.
Each factory function inserts a row into the DB and returns the ORM object.
"""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organisation import Organisation, Plan
from app.models.profile import Profile, Role
from app.models.property import Property, PropertyStatus, PropertyType, Unit, UnitStatus, UnitType

DEFAULT_ADDRESS = {
    "line1": "12 Kampala Road",
    "city": "Kampala",
    "state": "Central",
    "postcode": "00256",
    "country": "UG",
}

DEFAULT_RULES = {
    "gracePeriodDays": 5,
    "lateFeeType": "flat",
    "lateFeeValue": 50000,
    "depositMonths": 1,
    "noticePeriodDays": 30,
    "allowSubletting": False,
    "allowPets": False,
    "allowSmoking": False,
    "rentDayOfMonth": 1,
    "billingCurrency": "UGX",
    "maintenanceWindowHours": 24,
}


async def make_organisation(db: AsyncSession, **kwargs) -> Organisation:
    org = Organisation(
        logto_org_id=kwargs.get("logto_org_id", f"org_{uuid.uuid4().hex[:8]}"),
        name=kwargs.get("name", "Test Organisation"),
        slug=kwargs.get("slug", f"test-org-{uuid.uuid4().hex[:6]}"),
        plan=kwargs.get("plan", Plan.starter),
        currency=kwargs.get("currency", "UGX"),
        settings={},
    )
    db.add(org)
    await db.flush()
    return org


async def make_property(db: AsyncSession, org: Organisation, **kwargs) -> Property:
    prop = Property(
        organisation_id=org.id,
        name=kwargs.get("name", "Test Property"),
        type=kwargs.get("type", PropertyType.flat),
        status=kwargs.get("status", PropertyStatus.active),
        address=kwargs.get("address", DEFAULT_ADDRESS),
        rules=kwargs.get("rules", DEFAULT_RULES),
        description=kwargs.get("description", None),
        images=kwargs.get("images", []),
        tags=kwargs.get("tags", []),
        amenities=kwargs.get("amenities", []),
        currency=kwargs.get("currency", "UGX"),
    )
    db.add(prop)
    await db.flush()
    return prop


async def make_unit(db: AsyncSession, prop: Property, **kwargs) -> Unit:
    unit = Unit(
        property_id=prop.id,
        name=kwargs.get("name", "Unit 1A"),
        type=kwargs.get("type", UnitType.single),
        status=kwargs.get("status", UnitStatus.available),
        monthly_rent=kwargs.get("monthly_rent", 500_000),
        currency=kwargs.get("currency", "UGX"),
        bedrooms=kwargs.get("bedrooms", 1),
        bathrooms=kwargs.get("bathrooms", 1),
        amenities=kwargs.get("amenities", []),
        images=kwargs.get("images", []),
    )
    db.add(unit)
    await db.flush()
    return unit
