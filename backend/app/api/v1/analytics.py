"""
Analytics endpoints.

GET /analytics/dashboard  — KPI snapshot
GET /analytics/occupancy  — monthly occupancy series
GET /analytics/revenue    — monthly revenue series
GET /analytics/cashflow   — monthly cash-flow series
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, get_org_id
from app.core.database import get_db
from app.services import analytics_service

router = APIRouter(tags=["analytics"])


@router.get("/analytics/dashboard")
async def dashboard_stats(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = get_org_id(current_user)
    landlord_id = current_user.id if current_user.profile.is_read_only else None
    return await analytics_service.get_dashboard_stats(org_id, db, landlord_profile_id=landlord_id)


@router.get("/analytics/occupancy")
async def occupancy_series(
    months: int = Query(12, ge=1, le=36),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await analytics_service.get_occupancy_series(get_org_id(current_user), db, months)


@router.get("/analytics/revenue")
async def revenue_series(
    months: int = Query(12, ge=1, le=36),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await analytics_service.get_revenue_series(get_org_id(current_user), db, months)


@router.get("/analytics/cashflow")
async def cashflow_series(
    months: int = Query(12, ge=1, le=36),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await analytics_service.get_cashflow_series(get_org_id(current_user), db, months)
