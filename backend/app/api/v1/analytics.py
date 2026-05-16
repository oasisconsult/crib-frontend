"""
Analytics endpoints.

GET /analytics/dashboard  — KPI snapshot
GET /analytics/occupancy  — monthly occupancy series
GET /analytics/revenue    — monthly revenue series
GET /analytics/cashflow   — monthly cash-flow series
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user
from app.core.database import get_db
from app.services import analytics_service

router = APIRouter(tags=["analytics"])


def _require_org(current_user: CurrentUser) -> uuid.UUID:
    if current_user.org_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No organisation context")
    return current_user.org_id


@router.get("/analytics/dashboard")
async def dashboard_stats(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = _require_org(current_user)
    landlord_id = current_user.id if current_user.profile.is_read_only else None
    return await analytics_service.get_dashboard_stats(org_id, db, landlord_profile_id=landlord_id)


@router.get("/analytics/occupancy")
async def occupancy_series(
    months: int = Query(12, ge=1, le=36),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await analytics_service.get_occupancy_series(_require_org(current_user), db, months)


@router.get("/analytics/revenue")
async def revenue_series(
    months: int = Query(12, ge=1, le=36),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await analytics_service.get_revenue_series(_require_org(current_user), db, months)


@router.get("/analytics/cashflow")
async def cashflow_series(
    months: int = Query(12, ge=1, le=36),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await analytics_service.get_cashflow_series(_require_org(current_user), db, months)
