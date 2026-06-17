"""
Bulk tenant announcements.

POST /announcements          — compose + fan-out to all active tenants
GET  /announcements          — paginated history for the org
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_org_id, require_org_access
from app.core.database import get_db
from app.schemas.announcement import AnnouncementCreate, AnnouncementOut
from app.services import announcement_service

router = APIRouter(tags=["announcements"])

_write = Depends(require_org_access(allow_tenant_own=False))


@router.post("/announcements", response_model=AnnouncementOut, status_code=201)
async def create_announcement(
    body: AnnouncementCreate,
    current_user=_write,
    db: AsyncSession = Depends(get_db),
):
    """Broadcast a message to all active tenants in the org."""
    return await announcement_service.create_announcement(
        body=body,
        org_id=get_org_id(current_user),
        created_by_id=current_user.id,
        db=db,
    )


@router.get("/announcements", response_model=dict)
async def list_announcements(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user=_write,
    db: AsyncSession = Depends(get_db),
):
    """Return paginated announcement history for the org."""
    return await announcement_service.list_announcements(
        org_id=get_org_id(current_user),
        db=db,
        page=page,
        page_size=page_size,
    )
