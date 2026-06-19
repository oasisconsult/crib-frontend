"""General-purpose audit log service.

append() is intentionally fire-and-forget — it swallows all exceptions so that
audit failures never break the calling business operation.

list_logs() is a standard paginated read used by API endpoints.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

import structlog
from fastapi import Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.audit_log import AuditLog
from app.models.profile import Profile
from app.schemas.audit_log import AuditLogListOut, AuditLogOut

log = structlog.get_logger(__name__)


def _extract_request_context(request: Request | None) -> dict[str, str | None]:
    if request is None:
        return {"ip_address": None, "user_agent": None, "request_id": None}
    ip = (
        request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or request.headers.get("x-real-ip")
        or str(request.client.host) if request.client else None
    )
    return {
        "ip_address": ip or None,
        "user_agent": request.headers.get("user-agent"),
        "request_id": request.headers.get("x-request-id"),
    }


async def append(
    db: AsyncSession,
    *,
    organisation_id: uuid.UUID | None,
    actor_id: uuid.UUID | None,
    actor_role: str | None,
    resource_type: str,
    resource_id: uuid.UUID | None = None,
    resource_label: str | None = None,
    action: str,
    changes: dict[str, Any] | None = None,
    event_data: dict[str, Any] | None = None,
    request: Request | None = None,
) -> None:
    """Append an immutable audit entry.

    Never raises — any failure is logged and swallowed so callers are never
    disrupted by audit infrastructure issues.
    """
    try:
        ctx = _extract_request_context(request)
        entry = AuditLog(
            organisation_id=organisation_id,
            actor_id=actor_id,
            actor_role=actor_role,
            resource_type=resource_type,
            resource_id=resource_id,
            resource_label=resource_label,
            action=action,
            changes=changes or {},
            event_data=event_data or {},
            ip_address=ctx["ip_address"],
            user_agent=ctx["user_agent"],
            request_id=ctx["request_id"],
        )
        db.add(entry)
        await db.flush()
    except Exception:
        log.exception(
            "audit_service.append_failed",
            resource_type=resource_type,
            action=action,
            org_id=str(organisation_id),
        )


async def list_logs(
    db: AsyncSession,
    *,
    organisation_id: uuid.UUID | None,
    resource_type: str | None = None,
    action: str | None = None,
    actor_id: uuid.UUID | None = None,
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 50,
) -> AuditLogListOut:
    """Return a paginated, filtered list of audit log entries.

    organisation_id=None means superadmin cross-org access (no org filter applied).
    """
    actor_profile = aliased(Profile, name="actor_profile")

    base_q = (
        select(
            AuditLog,
            func.concat(actor_profile.first_name, " ", actor_profile.last_name).label("actor_name"),
        )
        .outerjoin(actor_profile, actor_profile.id == AuditLog.actor_id)
    )

    if organisation_id is not None:
        base_q = base_q.where(AuditLog.organisation_id == organisation_id)
    if resource_type:
        base_q = base_q.where(AuditLog.resource_type == resource_type)
    if action:
        base_q = base_q.where(AuditLog.action == action)
    if actor_id:
        base_q = base_q.where(AuditLog.actor_id == actor_id)
    if from_date:
        base_q = base_q.where(AuditLog.created_at >= from_date)
    if to_date:
        base_q = base_q.where(AuditLog.created_at <= to_date)
    if search:
        base_q = base_q.where(AuditLog.resource_label.ilike(f"%{search}%"))

    count_q = select(func.count()).select_from(base_q.subquery())
    total: int = await db.scalar(count_q) or 0

    data_q = (
        base_q
        .order_by(AuditLog.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await db.execute(data_q)).all()

    entries = [
        AuditLogOut(
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
        for row in rows
    ]

    return AuditLogListOut(data=entries, total=total, page=page, page_size=page_size)
