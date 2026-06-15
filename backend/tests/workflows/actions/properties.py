"""
Property and unit actions — create test fixtures via real API endpoints.
"""
from __future__ import annotations

from ..engine.client_factory import RoleClient
from ..engine.context import ExecutionContext
from ..engine.exceptions import StepError
from ..engine.registry import registry

_DEFAULT_ADDRESS = {
    "line1": "12 Test Road",
    "city": "Kampala",
    "state": "Central Region",
    "postcode": "00256",
    "country": "UG",
}

_DEFAULT_RULES = {
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


@registry.register("create_property")
async def create_property(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    Create a property via ``POST /api/v1/properties``.

    Input keys (all optional except name)
    --------------------------------------
    name, type, status, address, rules, description
    """
    payload = {
        "name": input.get("name", "Workflow Test Property"),
        "type": input.get("type", "flat"),
        "status": input.get("status", "active"),
        "address": input.get("address", _DEFAULT_ADDRESS),
        "rules": input.get("rules", _DEFAULT_RULES),
        "description": input.get("description", None),
        "images": [],
        "tags": [],
        "amenities": [],
        "isSingleUnit": False,
    }
    resp = await client.post("/api/v1/properties", json=payload)
    if resp.status_code not in (200, 201):
        raise StepError(
            f"create_property failed: {resp.status_code} {resp.text}",
            step_name=input.get("_step_name", "create_property"),
            action="create_property",
        )
    return resp.json()


@registry.register("create_unit")
async def create_unit(
    client: RoleClient,
    input: dict,
    ctx: ExecutionContext,
) -> dict:
    """
    Create a unit via ``POST /api/v1/properties/{id}/units``.

    Input keys
    ----------
    propertyId  : required
    name        : unit name (default "Unit 1")
    type        : unit type (default "one_bed")
    monthlyRent : default 500000
    """
    property_id = input["propertyId"]
    payload = {
        "name": input.get("name", "Unit 1"),
        "type": input.get("type", "one_bed"),
        "monthlyRent": input.get("monthlyRent", 500_000),
        "bedrooms": input.get("bedrooms", 1),
        "bathrooms": input.get("bathrooms", 1),
        "isSelfContained": input.get("isSelfContained", True),
        "furnishedStatus": input.get("furnishedStatus", "unfurnished"),
    }
    resp = await client.post(f"/api/v1/properties/{property_id}/units", json=payload)
    if resp.status_code not in (200, 201):
        raise StepError(
            f"create_unit failed: {resp.status_code} {resp.text}",
            step_name=input.get("_step_name", "create_unit"),
            action="create_unit",
        )
    return resp.json()
