"""
Inspection endpoints.

/inspections            GET list, POST create
/inspections/{id}       GET, PUT update
/inspections/{id}/transition  POST
/inspections/{id}/photos      PATCH

/maintenance            GET list, POST create
/maintenance/{id}       GET, PUT update
/maintenance/{id}/transition  POST
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user
from app.core.database import get_db
from app.schemas.inspection import (
    InspectionCreate,
    InspectionOut,
    InspectionPhotos,
    InspectionTransition,
    InspectionUpdate,
    MaintenanceCreate,
    MaintenanceOut,
    MaintenanceTransition,
    MaintenanceUpdate,
)
from app.services import inspection_service

router = APIRouter(tags=["inspections"])


# ── Inspections ────────────────────────────────────────────────────────────────

@router.get("/inspections", response_model=dict)
async def list_inspections(
    property_id: str | None = Query(None),
    unit_id: str | None = Query(None),
    state: str | None = Query(None),
    states: str | None = Query(None),
    type: str | None = Query(None, alias="type"),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    state_list = [s.strip() for s in states.split(",")] if states else ([state] if state else None)
    landlord_id = current_user.id if current_user.profile.is_read_only else None
    return await inspection_service.list_inspections(
        org_id=current_user.org_id,
        db=db,
        property_id=property_id,
        unit_id=unit_id,
        states=state_list,
        type_filter=type,
        search=search,
        page=page,
        page_size=page_size,
        landlord_profile_id=landlord_id,
    )


@router.post("/inspections", response_model=InspectionOut, status_code=201)
async def create_inspection(
    body: InspectionCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await inspection_service.create_inspection(body, current_user.org_id, db)


@router.get("/inspections/{inspection_id}", response_model=InspectionOut)
async def get_inspection(
    inspection_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await inspection_service.get_inspection(inspection_id, current_user.org_id, db)


@router.put("/inspections/{inspection_id}", response_model=InspectionOut)
async def update_inspection(
    inspection_id: uuid.UUID,
    body: InspectionUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await inspection_service.update_inspection(inspection_id, body, current_user.org_id, db)


@router.post("/inspections/{inspection_id}/transition", response_model=InspectionOut)
async def transition_inspection(
    inspection_id: uuid.UUID,
    body: InspectionTransition,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await inspection_service.transition_inspection(
        inspection_id, body.event, current_user.org_id, db
    )


@router.patch("/inspections/{inspection_id}/photos", response_model=InspectionOut)
async def add_inspection_photos(
    inspection_id: uuid.UUID,
    body: InspectionPhotos,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await inspection_service.add_inspection_photos(
        inspection_id, body.urls, current_user.org_id, db
    )


# ── Maintenance ────────────────────────────────────────────────────────────────

@router.get("/maintenance", response_model=dict)
async def list_maintenance(
    property_id: str | None = Query(None),
    state: str | None = Query(None),
    states: str | None = Query(None),
    priority: str | None = Query(None),
    category: str | None = Query(None),
    search: str | None = Query(None),
    reported_by: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    state_list = [s.strip() for s in states.split(",")] if states else ([state] if state else None)
    landlord_id = current_user.id if current_user.profile.is_read_only else None
    return await inspection_service.list_maintenance(
        org_id=current_user.org_id,
        db=db,
        property_id=property_id,
        states=state_list,
        priority=priority,
        category=category,
        search=search,
        reported_by=reported_by,
        page=page,
        page_size=page_size,
        landlord_profile_id=landlord_id,
    )


@router.post("/maintenance", response_model=MaintenanceOut, status_code=201)
async def create_maintenance(
    body: MaintenanceCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await inspection_service.create_maintenance_issue(body, current_user.org_id, db)


@router.get("/maintenance/{issue_id}", response_model=MaintenanceOut)
async def get_maintenance(
    issue_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await inspection_service.get_maintenance_issue(issue_id, current_user.org_id, db)


@router.put("/maintenance/{issue_id}", response_model=MaintenanceOut)
async def update_maintenance(
    issue_id: uuid.UUID,
    body: MaintenanceUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await inspection_service.update_maintenance_issue(issue_id, body, current_user.org_id, db)


@router.post("/maintenance/{issue_id}/transition", response_model=MaintenanceOut)
async def transition_maintenance(
    issue_id: uuid.UUID,
    body: MaintenanceTransition,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await inspection_service.transition_maintenance(issue_id, body, current_user.org_id, db)
