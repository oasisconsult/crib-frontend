"""
Reporting & Analytics endpoints.

All routes under /reports/ prefix.
Access guard: require_permission("read", "analytics") + require_financial_access()

Tier 1 (operational):
  GET /reports/portfolio              — KPI snapshot
  GET /reports/rent-collection        — collection rate per property / date range
  GET /reports/rent-arrears           — aging buckets
  GET /reports/occupancy              — occupancy / vacancy breakdown
  GET /reports/maintenance/overview   — status breakdown per property

Tier 2 (management):
  GET /reports/maintenance/costs      — cost by property / category / contractor
  GET /reports/contractors            — contractor performance
  GET /reports/lease-expiry           — leases expiring in 30 / 60 / 90 days
  GET /reports/income-expense         — monthly / quarterly / yearly P&L

Export:
  GET /reports/rent-collection/export  — CSV or XLSX
  GET /reports/rent-arrears/export
  GET /reports/lease-expiry/export
  GET /reports/income-expense/export
"""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, get_org_id, require_financial_access
from app.core.database import get_db
from app.core.redis import get_redis
from app.services import reporting_service as svc
from app.services.analytics_service import get_property_ids_for_profile
from app.services.policy_service import require_permission

router = APIRouter(tags=["reports"])

_access = [
    require_permission("read", "analytics"),
    Depends(require_financial_access()),
]


async def _prop_ids_for_user(current_user: CurrentUser, db: AsyncSession) -> list | None:
    if current_user.profile.is_read_only or current_user.has_role("caretaker"):
        return await get_property_ids_for_profile(current_user.id, db)
    return None


# ── Tier 1 ────────────────────────────────────────────────────────────────────

@router.get("/reports/portfolio", dependencies=_access)
async def portfolio_summary(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id    = get_org_id(current_user)
    prop_ids  = await _prop_ids_for_user(current_user, db)
    redis     = get_redis()
    return await svc.get_portfolio_summary(org_id, db, redis=redis, property_ids=prop_ids)


@router.get("/reports/rent-collection", dependencies=_access)
async def rent_collection(
    date_from:   date | None = Query(None, alias="dateFrom"),
    date_to:     date | None = Query(None, alias="dateTo"),
    property_id: uuid.UUID | None = Query(None, alias="propertyId"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = get_org_id(current_user)
    redis  = get_redis()
    return await svc.get_rent_collection_report(org_id, db, date_from, date_to, property_id, redis=redis)


@router.get("/reports/rent-arrears", dependencies=_access)
async def rent_arrears(
    property_id: uuid.UUID | None = Query(None, alias="propertyId"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = get_org_id(current_user)
    redis  = get_redis()
    return await svc.get_rent_arrears_report(org_id, db, property_id, redis=redis)


@router.get("/reports/occupancy", dependencies=_access)
async def occupancy_vacancy(
    property_id: uuid.UUID | None = Query(None, alias="propertyId"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = get_org_id(current_user)
    redis  = get_redis()
    return await svc.get_occupancy_vacancy_report(org_id, db, property_id, redis=redis)


@router.get("/reports/maintenance/overview", dependencies=_access)
async def maintenance_overview(
    property_id:    uuid.UUID | None = Query(None, alias="propertyId"),
    contractor_id:  uuid.UUID | None = Query(None, alias="contractorId"),
    date_from:      date | None       = Query(None, alias="dateFrom"),
    date_to:        date | None       = Query(None, alias="dateTo"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = get_org_id(current_user)
    redis  = get_redis()
    return await svc.get_maintenance_overview_report(
        org_id, db, property_id, contractor_id, date_from, date_to, redis=redis,
    )


# ── Tier 2 ────────────────────────────────────────────────────────────────────

@router.get("/reports/maintenance/costs", dependencies=_access)
async def maintenance_costs(
    property_id: uuid.UUID | None = Query(None, alias="propertyId"),
    date_from:   date | None       = Query(None, alias="dateFrom"),
    date_to:     date | None       = Query(None, alias="dateTo"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = get_org_id(current_user)
    redis  = get_redis()
    return await svc.get_maintenance_cost_report(org_id, db, property_id, date_from, date_to, redis=redis)


@router.get("/reports/contractors", dependencies=_access)
async def contractor_performance(
    date_from: date | None = Query(None, alias="dateFrom"),
    date_to:   date | None = Query(None, alias="dateTo"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = get_org_id(current_user)
    redis  = get_redis()
    return await svc.get_contractor_performance(org_id, db, date_from, date_to, redis=redis)


@router.get("/reports/lease-expiry", dependencies=_access)
async def lease_expiry(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = get_org_id(current_user)
    redis  = get_redis()
    return await svc.get_lease_expiry_report(org_id, db, redis=redis)


@router.get("/reports/income-expense", dependencies=_access)
async def income_expense(
    group_by: str = Query("month", pattern="^(month|quarter|year)$", alias="groupBy"),
    months:   int = Query(12, ge=1, le=60),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = get_org_id(current_user)
    redis  = get_redis()
    return await svc.get_income_expense_report(org_id, db, group_by, months, redis=redis)


# ── Exports ───────────────────────────────────────────────────────────────────

def _export_response(fmt: str, data_bytes: bytes | str, filename: str) -> Response:
    if fmt == "xlsx":
        return Response(
            content=data_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}.xlsx"'},
        )
    return Response(
        content=data_bytes if isinstance(data_bytes, bytes) else data_bytes.encode(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}.csv"'},
    )


@router.get("/reports/rent-collection/export", dependencies=_access)
async def export_rent_collection(
    fmt:         str             = Query("csv", pattern="^(csv|xlsx)$"),
    date_from:   date | None     = Query(None, alias="dateFrom"),
    date_to:     date | None     = Query(None, alias="dateTo"),
    property_id: uuid.UUID | None = Query(None, alias="propertyId"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = get_org_id(current_user)
    data   = await svc.get_rent_collection_report(org_id, db, date_from, date_to, property_id)
    headers, rows = svc.rent_collection_to_rows(data)
    if fmt == "xlsx":
        return _export_response("xlsx", svc.to_xlsx({"Rent Collection": (headers, rows)}), "rent-collection")
    return _export_response("csv", svc.to_csv(headers, rows), "rent-collection")


@router.get("/reports/rent-arrears/export", dependencies=_access)
async def export_rent_arrears(
    fmt:         str             = Query("csv", pattern="^(csv|xlsx)$"),
    property_id: uuid.UUID | None = Query(None, alias="propertyId"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = get_org_id(current_user)
    data   = await svc.get_rent_arrears_report(org_id, db, property_id)
    headers, rows = svc.rent_arrears_to_rows(data)
    if fmt == "xlsx":
        return _export_response("xlsx", svc.to_xlsx({"Rent Arrears": (headers, rows)}), "rent-arrears")
    return _export_response("csv", svc.to_csv(headers, rows), "rent-arrears")


@router.get("/reports/lease-expiry/export", dependencies=_access)
async def export_lease_expiry(
    fmt: str = Query("csv", pattern="^(csv|xlsx)$"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = get_org_id(current_user)
    data   = await svc.get_lease_expiry_report(org_id, db)
    headers, rows = svc.lease_expiry_to_rows(data)
    if fmt == "xlsx":
        return _export_response("xlsx", svc.to_xlsx({"Lease Expiry": (headers, rows)}), "lease-expiry")
    return _export_response("csv", svc.to_csv(headers, rows), "lease-expiry")


@router.get("/reports/income-expense/export", dependencies=_access)
async def export_income_expense(
    fmt:      str = Query("csv", pattern="^(csv|xlsx)$"),
    group_by: str = Query("month", pattern="^(month|quarter|year)$", alias="groupBy"),
    months:   int = Query(12, ge=1, le=60),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = get_org_id(current_user)
    data   = await svc.get_income_expense_report(org_id, db, group_by, months)
    headers, rows = svc.income_expense_to_rows(data)
    if fmt == "xlsx":
        return _export_response("xlsx", svc.to_xlsx({"Income & Expense": (headers, rows)}), "income-expense")
    return _export_response("csv", svc.to_csv(headers, rows), "income-expense")
