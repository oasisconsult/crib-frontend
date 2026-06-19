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

from app.api.deps import CurrentUser, get_current_user, get_org_id
from app.core.database import get_db
from app.services.subscription_limits import check_feature_access
from app.schemas.inspection import (
    AssignInspectorBody,
    InspectionCreate,
    InspectionOut,
    InspectionPhotos,
    InspectionPublicOut,
    InspectionSignLandlord,
    InspectionTransition,
    InspectionUpdate,
    InspectorPortalOut,
    InspectorSubmitBody,
    MaintenanceCreate,
    MaintenanceOut,
    MaintenanceTransition,
    MaintenanceUpdate,
    TenantSignRequest,
)
from app.services import inspection_service

router = APIRouter(tags=["inspections"])


# ── Inspections ────────────────────────────────────────────────────────────────

@router.get("/inspections", response_model=dict)
async def list_inspections(
    property_id: str | None = Query(None),
    unit_id: str | None = Query(None),
    lease_id: str | None = Query(None, alias="leaseId"),
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

    # Tenants scope by their own profile ID (bypasses org_id mismatch with
    # inspections created by a superadmin that have organisation_id=NULL)
    tenant_profile_id = current_user.id if current_user.profile.role == "tenant" else None

    return await inspection_service.list_inspections(
        org_id=get_org_id(current_user) if tenant_profile_id is None else None,
        db=db,
        property_id=property_id,
        unit_id=unit_id,
        lease_id=lease_id,
        states=state_list,
        type_filter=type,
        search=search,
        page=page,
        page_size=page_size,
        landlord_profile_id=landlord_id,
        tenant_profile_id=tenant_profile_id,
    )


@router.post("/inspections", response_model=InspectionOut, status_code=201)
async def create_inspection(
    body: InspectionCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.org_id is not None:
        await check_feature_access(current_user.org_id, "inspection_reports", db)
    return await inspection_service.create_inspection(body, current_user.org_id, db)


@router.get("/inspections/{inspection_id}", response_model=InspectionOut)
async def get_inspection(
    inspection_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await inspection_service.get_inspection(inspection_id, get_org_id(current_user), db)


@router.put("/inspections/{inspection_id}", response_model=InspectionOut)
async def update_inspection(
    inspection_id: uuid.UUID,
    body: InspectionUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await inspection_service.update_inspection(inspection_id, body, get_org_id(current_user), db)


@router.post("/inspections/{inspection_id}/transition", response_model=InspectionOut)
async def transition_inspection(
    inspection_id: uuid.UUID,
    body: InspectionTransition,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await inspection_service.transition_inspection(
        inspection_id, body.event, get_org_id(current_user), db
    )


@router.patch("/inspections/{inspection_id}/photos", response_model=InspectionOut)
async def add_inspection_photos(
    inspection_id: uuid.UUID,
    body: InspectionPhotos,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await inspection_service.add_inspection_photos(
        inspection_id, body.urls, get_org_id(current_user), db
    )


@router.post("/inspections/{inspection_id}/report", response_model=InspectionOut)
async def generate_report(
    inspection_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await inspection_service.generate_report_pdf(
        inspection_id, get_org_id(current_user), db
    )


@router.get("/inspections/{inspection_id}/report/download")
async def download_report(
    inspection_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    import io
    from fastapi.responses import StreamingResponse
    pdf_bytes = await inspection_service.download_report_pdf(
        inspection_id, get_org_id(current_user), db
    )
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="inspection-report-{inspection_id}.pdf"'
        },
    )


@router.post("/inspections/{inspection_id}/sign/landlord", response_model=InspectionOut)
async def sign_landlord(
    inspection_id: uuid.UUID,
    body: InspectionSignLandlord,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = get_org_id(current_user)
    if org_id is not None:
        await check_feature_access(org_id, "inspection_reports", db)
    return await inspection_service.sign_landlord(
        inspection_id, body.signed_by, org_id, db
    )


@router.post("/inspections/{inspection_id}/send-for-signing", response_model=InspectionOut)
async def send_for_tenant_signing(
    inspection_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = get_org_id(current_user)
    if org_id is not None:
        await check_feature_access(org_id, "inspection_reports", db)
    return await inspection_service.send_for_tenant_signing(
        inspection_id, org_id, db
    )


# ── Public sign endpoints (no auth) ───────────────────────────────────────────

@router.get("/inspections/{inspection_id}/report/download-public")
async def download_report_public(
    inspection_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Public PDF download — available only after both parties have signed."""
    import io
    from fastapi.responses import StreamingResponse
    pdf_bytes = await inspection_service.download_report_pdf_public(inspection_id, db)
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="inspection-report-{inspection_id}.pdf"'
        },
    )


@router.get("/inspections/sign/{token}", response_model=InspectionPublicOut)
async def get_inspection_by_sign_token(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    return await inspection_service.get_by_sign_token(token, db)


@router.post("/inspections/sign/{token}", response_model=InspectionPublicOut)
async def tenant_sign_inspection(
    token: str,
    body: TenantSignRequest,
    db: AsyncSession = Depends(get_db),
):
    return await inspection_service.sign_tenant(token, body.full_name, db)


# ── Inspector portal endpoints (external inspector, no login) ──────────────────

@router.post("/inspections/{inspection_id}/assign-inspector", response_model=InspectionOut)
async def assign_inspector(
    inspection_id: uuid.UUID,
    body: AssignInspectorBody,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Assign a contractor-inspector and dispatch their portal invite email."""
    if not current_user.is_owner_or_manager():
        from fastapi import HTTPException, status as _status
        raise HTTPException(status_code=_status.HTTP_403_FORBIDDEN, detail="Only managers and owners can assign inspectors")
    return await inspection_service.assign_inspector(
        inspection_id, body, get_org_id(current_user), db
    )


@router.post("/inspections/{inspection_id}/resend-inspector-invite", response_model=InspectionOut)
async def resend_inspector_invite(
    inspection_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Regenerate inspector token and re-send the portal invite email/WhatsApp."""
    if not current_user.is_owner_or_manager():
        from fastapi import HTTPException, status as _status
        raise HTTPException(status_code=_status.HTTP_403_FORBIDDEN, detail="Only managers and owners can resend inspector invites")
    return await inspection_service.resend_inspector_invite(
        inspection_id, get_org_id(current_user), db
    )


@router.get("/inspections/portal/{token}", response_model=InspectorPortalOut)
async def inspector_portal_get(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """Public — inspector retrieves their assigned inspection via token link."""
    return await inspection_service.get_by_inspector_token(token, db)


@router.post("/inspections/portal/{token}", response_model=InspectorPortalOut)
async def inspector_portal_submit(
    token: str,
    body: InspectorSubmitBody,
    db: AsyncSession = Depends(get_db),
):
    """Public — inspector submits checklist findings via token link."""
    return await inspection_service.inspector_submit(token, body, db)


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
        org_id=get_org_id(current_user),
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
    if current_user.org_id is not None:
        await check_feature_access(current_user.org_id, "maintenance_workflows", db)
    return await inspection_service.create_maintenance_issue(body, current_user.org_id, db)


@router.get("/maintenance/{issue_id}", response_model=MaintenanceOut)
async def get_maintenance(
    issue_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await inspection_service.get_maintenance_issue(issue_id, get_org_id(current_user), db)


@router.put("/maintenance/{issue_id}", response_model=MaintenanceOut)
async def update_maintenance(
    issue_id: uuid.UUID,
    body: MaintenanceUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await inspection_service.update_maintenance_issue(issue_id, body, get_org_id(current_user), db)


@router.post("/maintenance/{issue_id}/transition", response_model=MaintenanceOut)
async def transition_maintenance(
    issue_id: uuid.UUID,
    body: MaintenanceTransition,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await inspection_service.transition_maintenance(issue_id, body, get_org_id(current_user), db)
