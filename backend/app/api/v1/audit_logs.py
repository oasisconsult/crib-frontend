"""
Audit Logs REST API.

  GET  /audit-logs           — paginated list for the current org (Agency+ gated)
  GET  /audit-logs/{id}      — single entry (same auth)
  GET  /admin/audit-logs     — cross-org list for superadmin (no subscription gate)

Org-level endpoints are restricted to owner/manager roles and require the
'audit_logs' plan feature (Agency+ subscription tier).
"""
from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_org_id, require_org_access, require_role
from app.core.database import get_db
from app.models.audit_log import AuditLog
from app.schemas.audit_log import AuditLogListOut, AuditLogOut
from app.services import audit_service
from app.services.subscription_limits import check_feature_access

router = APIRouter(tags=["audit-logs"])
admin_router = APIRouter(tags=["audit-logs"])

_write_guard = Depends(require_org_access(allow_tenant_own=False))
_superadmin_guard = Depends(require_role("superadmin"))


# ── Org-level endpoints ────────────────────────────────────────────────────────

@router.get("/audit-logs", response_model=AuditLogListOut)
async def list_audit_logs(
    resource_type: str | None = Query(None, alias="resourceType"),
    action: str | None = Query(None),
    actor_id: uuid.UUID | None = Query(None, alias="actorId"),
    from_date: datetime | None = Query(None, alias="fromDate"),
    to_date: datetime | None = Query(None, alias="toDate"),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200, alias="pageSize"),
    current_user: CurrentUser = _write_guard,
    db: AsyncSession = Depends(get_db),
) -> AuditLogListOut:
    org_id = get_org_id(current_user)
    if org_id is not None:
        await check_feature_access(org_id, "audit_logs", db)
    return await audit_service.list_logs(
        db,
        organisation_id=org_id,
        resource_type=resource_type,
        action=action,
        actor_id=actor_id,
        from_date=from_date,
        to_date=to_date,
        search=search,
        page=page,
        page_size=page_size,
    )


@router.get("/audit-logs/{log_id}", response_model=AuditLogOut)
async def get_audit_log(
    log_id: uuid.UUID,
    current_user: CurrentUser = _write_guard,
    db: AsyncSession = Depends(get_db),
) -> AuditLogOut:
    org_id = get_org_id(current_user)
    if org_id is not None:
        await check_feature_access(org_id, "audit_logs", db)

    from sqlalchemy import select
    from sqlalchemy.orm import aliased
    from app.models.profile import Profile
    from sqlalchemy import func

    actor_profile = aliased(Profile, name="actor_profile")
    row = (await db.execute(
        select(
            AuditLog,
            func.concat(actor_profile.first_name, " ", actor_profile.last_name).label("actor_name"),
        )
        .outerjoin(actor_profile, actor_profile.id == AuditLog.actor_id)
        .where(AuditLog.id == log_id)
        .where(AuditLog.organisation_id == org_id if org_id else AuditLog.id == log_id)
    )).first()

    if not row:
        raise HTTPException(status_code=404, detail="Audit log entry not found")

    return AuditLogOut(
        id=row.AuditLog.id,
        organisation_id=row.AuditLog.organisation_id,
        actor_id=row.AuditLog.actor_id,
        actor_role=row.AuditLog.actor_role,
        actor_name=row.actor_name.strip() if row.actor_name and row.actor_name.strip() else None,
        resource_type=row.AuditLog.resource_type,
        resource_id=row.AuditLog.resource_id,
        resource_label=row.AuditLog.resource_label,
        action=row.AuditLog.action,
        changes=row.AuditLog.changes or {},
        event_data=row.AuditLog.event_data or {},
        ip_address=row.AuditLog.ip_address,
        request_id=row.AuditLog.request_id,
        created_at=row.AuditLog.created_at,
    )


# ── Admin endpoint (superadmin, cross-org) ─────────────────────────────────────

@admin_router.get("/admin/audit-logs", response_model=AuditLogListOut)
async def admin_list_audit_logs(
    org_id: uuid.UUID | None = Query(None, alias="orgId"),
    resource_type: str | None = Query(None, alias="resourceType"),
    action: str | None = Query(None),
    actor_id: uuid.UUID | None = Query(None, alias="actorId"),
    from_date: datetime | None = Query(None, alias="fromDate"),
    to_date: datetime | None = Query(None, alias="toDate"),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200, alias="pageSize"),
    current_user: CurrentUser = _superadmin_guard,
    db: AsyncSession = Depends(get_db),
) -> AuditLogListOut:
    return await audit_service.list_logs(
        db,
        organisation_id=org_id,  # None = all orgs
        resource_type=resource_type,
        action=action,
        actor_id=actor_id,
        from_date=from_date,
        to_date=to_date,
        search=search,
        page=page,
        page_size=page_size,
    )
