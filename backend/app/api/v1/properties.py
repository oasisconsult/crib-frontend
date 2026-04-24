"""
Properties + Units REST API.

All routes are organisation-scoped: the current user's org_id is used as the
isolation boundary. A user cannot read or modify properties belonging to another org.

Endpoints:
  GET    /properties
  POST   /properties
  GET    /properties/{id}
  PUT    /properties/{id}
  PATCH  /properties/{id}/rules
  DELETE /properties/{id}

  GET    /properties/{id}/units
  POST   /properties/{id}/units
  POST   /properties/{id}/units/batch
  GET    /properties/{id}/units/{unit_id}
  PUT    /properties/{id}/units/{unit_id}
  PATCH  /properties/{id}/units/{unit_id}/rules
  PATCH  /properties/{id}/units/bulk
  DELETE /properties/{id}/units/{unit_id}
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, require_org_access
from app.core.database import get_db
from app.schemas.common import PaginatedResponse
from app.schemas.property import (
    BatchUnitCreate,
    BulkUnitUpdate,
    PropertyCreate,
    PropertyOut,
    PropertyRulesSchema,
    PropertyUpdate,
    UnitCreate,
    UnitOut,
    UnitRulesUpdate,
    UnitUpdate,
)
from app.services import property_service as svc

router = APIRouter(prefix="/properties", tags=["properties"])

# Convenience: managers and owners can mutate; tenants read-only via require_org_access
_read  = Depends(require_org_access(allow_tenant_own=True))
_write = Depends(require_org_access(allow_tenant_own=False))


# ── Properties ────────────────────────────────────────────────────────────────

@router.get("", response_model=dict)
async def list_properties(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
    status: str | None = Query(None),
    type: str | None = Query(None),
    search: str | None = Query(None),
    current_user: CurrentUser = _read,
    db: AsyncSession = Depends(get_db),
):
    if current_user.org_id is None:
        raise HTTPException(status_code=403, detail="No organisation context")
    landlord_id = current_user.id if current_user.has_role("landlord") else None
    return await svc.list_properties(
        current_user.org_id, db, page, page_size, status, type, search,
        landlord_profile_id=landlord_id,
    )


@router.post("", response_model=PropertyOut, status_code=status.HTTP_201_CREATED)
async def create_property(
    body: PropertyCreate,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    if current_user.org_id is None:
        raise HTTPException(status_code=403, detail="No organisation context")
    return await svc.create_property(body, current_user.org_id, db)


@router.get("/{property_id}", response_model=PropertyOut)
async def get_property(
    property_id: uuid.UUID,
    current_user: CurrentUser = _read,
    db: AsyncSession = Depends(get_db),
):
    landlord_id = current_user.id if current_user.has_role("landlord") else None
    prop = await svc.get_property(property_id, current_user.org_id, db, landlord_profile_id=landlord_id)
    return await svc._property_out(prop, db)


@router.put("/{property_id}", response_model=PropertyOut)
async def update_property(
    property_id: uuid.UUID,
    body: PropertyUpdate,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    return await svc.update_property(property_id, body, current_user.org_id, db)


@router.patch("/{property_id}/rules", response_model=PropertyOut)
async def update_property_rules(
    property_id: uuid.UUID,
    body: PropertyRulesSchema,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    return await svc.update_property_rules(
        property_id, body.model_dump(by_alias=True, exclude_none=True), current_user.org_id, db
    )


@router.delete("/{property_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_property(
    property_id: uuid.UUID,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    await svc.delete_property(property_id, current_user.org_id, db)


# ── Units ─────────────────────────────────────────────────────────────────────

@router.get("/{property_id}/units", response_model=dict)
async def list_units(
    property_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200, alias="pageSize"),
    status: str | None = Query(None),
    current_user: CurrentUser = _read,
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_units(property_id, current_user.org_id, db, page, page_size, status)


# NOTE: /batch must be registered BEFORE /{unit_id} so FastAPI doesn't treat
# "batch" as a UUID path parameter.
@router.post("/{property_id}/units/batch", response_model=list[UnitOut], status_code=status.HTTP_201_CREATED)
async def batch_create_units(
    property_id: uuid.UUID,
    body: BatchUnitCreate,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    return await svc.batch_create_units(property_id, body, current_user.org_id, db)


@router.patch("/{property_id}/units/bulk", response_model=list[UnitOut])
async def bulk_update_units(
    property_id: uuid.UUID,
    body: BulkUnitUpdate,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    return await svc.bulk_update_units(property_id, body, current_user.org_id, db)


@router.post("/{property_id}/units", response_model=UnitOut, status_code=status.HTTP_201_CREATED)
async def create_unit(
    property_id: uuid.UUID,
    body: UnitCreate,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    return await svc.create_unit(property_id, body, current_user.org_id, db)


@router.get("/{property_id}/units/{unit_id}", response_model=UnitOut)
async def get_unit(
    property_id: uuid.UUID,
    unit_id: uuid.UUID,
    current_user: CurrentUser = _read,
    db: AsyncSession = Depends(get_db),
):
    return await svc.get_unit(property_id, unit_id, current_user.org_id, db)


@router.put("/{property_id}/units/{unit_id}", response_model=UnitOut)
async def update_unit(
    property_id: uuid.UUID,
    unit_id: uuid.UUID,
    body: UnitUpdate,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    return await svc.update_unit(property_id, unit_id, body, current_user.org_id, db)


@router.patch("/{property_id}/units/{unit_id}/rules", response_model=UnitOut)
async def update_unit_rules(
    property_id: uuid.UUID,
    unit_id: uuid.UUID,
    body: UnitRulesUpdate,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    return await svc.update_unit_rules(property_id, unit_id, body, current_user.org_id, db)


@router.delete("/{property_id}/units/{unit_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_unit(
    property_id: uuid.UUID,
    unit_id: uuid.UUID,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    await svc.delete_unit(property_id, unit_id, current_user.org_id, db)
