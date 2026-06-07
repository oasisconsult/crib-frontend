"""
Notification endpoints.

/notification-templates              GET list, POST create
/notification-templates/{id}         GET, PUT update, DELETE soft-delete
/notification-templates/{id}/preview POST

/notifications                       GET list
/notifications/send                  POST queue + dispatch
/notifications/stats                 GET aggregate stats
/notifications/{id}/read             POST mark as read
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, get_org_id
from app.core.database import get_db
from app.schemas.notification import (
    NotificationOut,
    NotificationSend,
    NotificationStatsOut,
    TemplateCreate,
    TemplateOut,
    TemplatePreview,
    TemplateUpdate,
)
from app.services import notification_service

router = APIRouter(tags=["notifications"])


# ── Templates ──────────────────────────────────────────────────────────────────

@router.get("/notification-templates", response_model=list[TemplateOut])
async def list_templates(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await notification_service.list_templates(org_id=get_org_id(current_user), db=db)


@router.post("/notification-templates", response_model=TemplateOut, status_code=201)
async def create_template(
    body: TemplateCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await notification_service.create_template(body=body, org_id=current_user.org_id, db=db)


@router.get("/notification-templates/{template_id}", response_model=TemplateOut)
async def get_template(
    template_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await notification_service.get_template(
        template_id=template_id, org_id=get_org_id(current_user), db=db
    )


@router.put("/notification-templates/{template_id}", response_model=TemplateOut)
async def update_template(
    template_id: uuid.UUID,
    body: TemplateUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await notification_service.update_template(
        template_id=template_id, body=body, org_id=get_org_id(current_user), db=db
    )


@router.delete("/notification-templates/{template_id}", status_code=204)
async def delete_template(
    template_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await notification_service.delete_template(
        template_id=template_id, org_id=get_org_id(current_user), db=db
    )


@router.post("/notification-templates/{template_id}/preview")
async def preview_template(
    template_id: uuid.UUID,
    body: TemplatePreview,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await notification_service.preview_template(
        template_id=template_id,
        variables=body.variables,
        org_id=get_org_id(current_user),
        db=db,
    )


# ── Notifications ──────────────────────────────────────────────────────────────

@router.get("/notifications", response_model=dict)
async def list_notifications(
    channel: str | None = Query(None),
    state: str | None = Query(None),
    states: str | None = Query(None),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    state_list = [s.strip() for s in states.split(",")] if states else ([state] if state else None)
    return await notification_service.list_notifications(
        org_id=get_org_id(current_user),
        db=db,
        channel=channel,
        states=state_list,
        search=search,
        page=page,
        page_size=page_size,
    )


@router.post("/notifications/send", response_model=NotificationOut, status_code=201)
async def send_notification(
    body: NotificationSend,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await notification_service.send_notification(
        body=body, org_id=current_user.org_id, db=db
    )


@router.get("/notifications/stats", response_model=NotificationStatsOut)
async def get_stats(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await notification_service.get_stats(org_id=get_org_id(current_user), db=db)


@router.post("/notifications/{notification_id}/read", response_model=NotificationOut)
async def mark_read(
    notification_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await notification_service.mark_read(
        notification_id=notification_id, org_id=get_org_id(current_user), db=db
    )
