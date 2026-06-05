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

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete as _delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_org_id, require_org_access, require_superadmin
from app.core.database import get_db
from app.models.landlord_invite import LandlordPropertyAccess

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
from app.services.subscription_limits import check_property_limit, check_unit_limit

log = structlog.get_logger(__name__)

router = APIRouter(prefix="/properties", tags=["properties"])

# Convenience: managers and owners can mutate; tenants read-only via require_org_access
_read  = Depends(require_org_access(allow_tenant_own=True))
_write = Depends(require_org_access(allow_tenant_own=False))


async def _resolve_caretaker_filter(
    current_user: CurrentUser, db: AsyncSession
) -> tuple[list[uuid.UUID] | None, uuid.UUID | None]:
    """
    Return (property_id_filter, landlord_id) for the current user.

    - Regular owners/managers: (None, None) → no extra filter, sees all org properties.
    - Read-only landlords: (None, profile.id) → filtered via LandlordPropertyAccess.
    - Caretakers: (caretaker_property_ids_as_uuids, profile.id)
        Uses caretaker_property_ids directly AND keeps LandlordPropertyAccess in sync
        so analytics/leases/inspection endpoints (which use LPA) stay accurate.
    """
    if current_user.profile.is_read_only:
        return None, current_user.id

    if "caretaker" not in current_user.roles:
        return None, None

    raw_ids: list[str] = current_user.profile.caretaker_property_ids or []
    prop_uuids: list[uuid.UUID] = []
    for pid in raw_ids:
        try:
            prop_uuids.append(uuid.UUID(str(pid)))
        except (ValueError, TypeError):
            log.warning("caretaker.invalid_property_id_in_profile", pid=pid,
                        profile_id=str(current_user.id))

    # Sync LandlordPropertyAccess rows so all other services (analytics, leases, etc.)
    # see the correct set.  Only write when count differs to avoid pointless churn.
    from sqlalchemy import func as _func
    existing_count = await db.scalar(
        select(_func.count(LandlordPropertyAccess.property_id)).where(
            LandlordPropertyAccess.landlord_profile_id == current_user.id
        )
    ) or 0

    if existing_count != len(prop_uuids):
        await db.execute(
            _delete(LandlordPropertyAccess).where(
                LandlordPropertyAccess.landlord_profile_id == current_user.id
            )
        )
        for prop_uuid in prop_uuids:
            db.add(LandlordPropertyAccess(
                landlord_profile_id=current_user.id,
                property_id=prop_uuid,
                is_read_only=False,
                granted_by_profile_id=current_user.profile.caretaker_owner_profile_id,
            ))
        await db.flush()
        log.info("caretaker.lpa_synced", profile_id=str(current_user.id),
                 count=len(prop_uuids))

    return prop_uuids, current_user.id


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
    org_id = get_org_id(current_user)
    prop_filter, landlord_id = await _resolve_caretaker_filter(current_user, db)
    return await svc.list_properties(
        org_id, db, page, page_size, status, type, search,
        landlord_profile_id=landlord_id if prop_filter is None else None,
        property_id_filter=prop_filter,
    )


@router.post("", response_model=PropertyOut, status_code=status.HTTP_201_CREATED)
async def create_property(
    body: PropertyCreate,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    org_id = get_org_id(current_user)
    if org_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Properties must belong to an organisation. Create or join an organisation first.",
        )
    await check_property_limit(org_id, db)
    return await svc.create_property(body, org_id, db)


@router.get("/{property_id}", response_model=PropertyOut)
async def get_property(
    property_id: uuid.UUID,
    current_user: CurrentUser = _read,
    db: AsyncSession = Depends(get_db),
):
    prop_filter, landlord_id = await _resolve_caretaker_filter(current_user, db)
    prop = await svc.get_property(
        property_id, get_org_id(current_user), db,
        landlord_profile_id=landlord_id if prop_filter is None else None,
        property_id_filter=prop_filter,
    )
    return await svc._property_out(prop, db)


@router.put("/{property_id}", response_model=PropertyOut)
async def update_property(
    property_id: uuid.UUID,
    body: PropertyUpdate,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    return await svc.update_property(property_id, body, get_org_id(current_user), db)


@router.patch("/{property_id}/rules", response_model=PropertyOut)
async def update_property_rules(
    property_id: uuid.UUID,
    body: PropertyRulesSchema,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    return await svc.update_property_rules(
        property_id, body.model_dump(by_alias=True, exclude_none=True), get_org_id(current_user), db
    )


@router.delete("/{property_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_property(
    property_id: uuid.UUID,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    """Soft-archive a property. Blocked if any unit is occupied or has an active lease."""
    await svc.delete_property(property_id, get_org_id(current_user), db)


@router.post("/{property_id}/restore", response_model=PropertyOut)
async def restore_property(
    property_id: uuid.UUID,
    current_user: CurrentUser = Depends(require_superadmin()),
    db: AsyncSession = Depends(get_db),
):
    """Restore a soft-archived property and all its units (superadmin only)."""
    org_id = get_org_id(current_user)
    if org_id is not None:                          # superadmin bypass — no plan limit applies
        await check_property_limit(org_id, db)
    return await svc.restore_property(property_id, org_id, db)


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
    return await svc.list_units(property_id, get_org_id(current_user), db, page, page_size, status)


# NOTE: /batch must be registered BEFORE /{unit_id} so FastAPI doesn't treat
# "batch" as a UUID path parameter.
@router.post("/{property_id}/units/batch", response_model=list[UnitOut], status_code=status.HTTP_201_CREATED)
async def batch_create_units(
    property_id: uuid.UUID,
    body: BatchUnitCreate,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    org_id = get_org_id(current_user)
    if org_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Units must belong to an organisation. Create or join an organisation first.",
        )
    await check_unit_limit(org_id, db, adding=len(body.units))
    return await svc.batch_create_units(property_id, body, org_id, db)


@router.patch("/{property_id}/units/bulk", response_model=list[UnitOut])
async def bulk_update_units(
    property_id: uuid.UUID,
    body: BulkUnitUpdate,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    return await svc.bulk_update_units(property_id, body, get_org_id(current_user), db)


@router.post("/{property_id}/units", response_model=UnitOut, status_code=status.HTTP_201_CREATED)
async def create_unit(
    property_id: uuid.UUID,
    body: UnitCreate,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    org_id = get_org_id(current_user)
    if org_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Units must belong to an organisation. Create or join an organisation first.",
        )
    await check_unit_limit(org_id, db)
    return await svc.create_unit(property_id, body, org_id, db)


@router.get("/{property_id}/units/{unit_id}", response_model=UnitOut)
async def get_unit(
    property_id: uuid.UUID,
    unit_id: uuid.UUID,
    current_user: CurrentUser = _read,
    db: AsyncSession = Depends(get_db),
):
    return await svc.get_unit(property_id, unit_id, get_org_id(current_user), db)


@router.put("/{property_id}/units/{unit_id}", response_model=UnitOut)
async def update_unit(
    property_id: uuid.UUID,
    unit_id: uuid.UUID,
    body: UnitUpdate,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    return await svc.update_unit(property_id, unit_id, body, get_org_id(current_user), db)


@router.patch("/{property_id}/units/{unit_id}/rules", response_model=UnitOut)
async def update_unit_rules(
    property_id: uuid.UUID,
    unit_id: uuid.UUID,
    body: UnitRulesUpdate,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    return await svc.update_unit_rules(property_id, unit_id, body, get_org_id(current_user), db)


@router.delete("/{property_id}/units/{unit_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_unit(
    property_id: uuid.UUID,
    unit_id: uuid.UUID,
    current_user: CurrentUser = _write,
    db: AsyncSession = Depends(get_db),
):
    """Soft-archive a unit. Blocked if the unit is currently occupied."""
    assert get_org_id(current_user) is not None
    await svc.delete_unit(property_id, unit_id, get_org_id(current_user), db)


@router.post("/{property_id}/units/{unit_id}/restore", response_model=UnitOut)
async def restore_unit(
    property_id: uuid.UUID,
    unit_id: uuid.UUID,
    current_user: CurrentUser = Depends(require_superadmin()),
    db: AsyncSession = Depends(get_db),
):
    """Restore a soft-archived unit (superadmin only)."""
    assert get_org_id(current_user) is not None
    return await svc.restore_unit(property_id, unit_id, get_org_id(current_user), db)
