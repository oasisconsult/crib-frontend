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

from app.api.deps import CurrentUser, get_current_user, get_org_id, require_financial_access
from app.core.database import get_db
from app.services import analytics_service
from app.services.analytics_service import get_property_ids_for_profile
from app.services.policy_service import require_permission
from app.services.subscription_limits import check_feature_access

router = APIRouter(tags=["analytics"])

# ── Analytics access guard ────────────────────────────────────────────────────
# Two layers:
#   1. require_permission("read", "analytics") — DB-driven; which roles may see
#      analytics is configured in the admin RBAC settings panel, not hardcoded.
#      Superadmin always passes; org-scoping happens in the service layer.
#   2. require_financial_access() — structural guard that blocks caretakers whose
#      permission_level is "operations_only" regardless of DB role permissions.
_analytics_access = [
    require_permission("read", "analytics"),
    Depends(require_financial_access()),
]


async def _prop_ids_for_user(
    current_user: CurrentUser, db: AsyncSession
) -> list | None:
    """
    Return the list of property UUIDs to scope analytics to, or None for
    unrestricted access (owners, managers, superadmins).

    Scoping applies to:
      - Read-only (agency-managed) landlords — via LandlordPropertyAccess rows
      - Caretakers — also via LandlordPropertyAccess rows seeded at onboarding
    Both roles get their property_ids from the same join table so the same
    helper works for both.
    """
    if current_user.profile.is_read_only or current_user.has_role("caretaker"):
        return await get_property_ids_for_profile(current_user.id, db)
    return None


@router.get("/analytics/dashboard", dependencies=_analytics_access)
async def dashboard_stats(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = get_org_id(current_user)
    prop_ids = await _prop_ids_for_user(current_user, db)
    # Pass as landlord_profile_id only when no explicit prop_ids to use the
    # existing DB-fetch path; otherwise pass prop_ids directly.
    if prop_ids is not None:
        return await analytics_service.get_dashboard_stats(
            org_id, db, landlord_profile_id=current_user.id
        )
    return await analytics_service.get_dashboard_stats(org_id, db)


@router.get("/analytics/occupancy", dependencies=_analytics_access)
async def occupancy_series(
    months: int = Query(12, ge=1, le=36),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = get_org_id(current_user)
    if org_id is not None:
        await check_feature_access(org_id, "analytics_advanced", db)
    prop_ids = await _prop_ids_for_user(current_user, db)
    return await analytics_service.get_occupancy_series(
        org_id, db, months, prop_ids=prop_ids
    )


@router.get("/analytics/revenue", dependencies=_analytics_access)
async def revenue_series(
    months: int = Query(12, ge=1, le=36),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = get_org_id(current_user)
    if org_id is not None:
        await check_feature_access(org_id, "analytics_advanced", db)
    prop_ids = await _prop_ids_for_user(current_user, db)
    return await analytics_service.get_revenue_series(
        org_id, db, months, prop_ids=prop_ids
    )


@router.get("/analytics/cashflow", dependencies=_analytics_access)
async def cashflow_series(
    months: int = Query(12, ge=1, le=36),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = get_org_id(current_user)
    if org_id is not None:
        await check_feature_access(org_id, "analytics_advanced", db)
    prop_ids = await _prop_ids_for_user(current_user, db)
    return await analytics_service.get_cashflow_series(
        org_id, db, months, prop_ids=prop_ids
    )
