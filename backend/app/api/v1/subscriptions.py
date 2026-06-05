"""
Subscription management endpoints.

Accessible by: owner, manager, superadmin (of the authenticated org).
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, require_role
from app.core.database import get_db
from app.schemas.common import MessageResponse
from app.schemas.subscription import (
    BillingAnalyticsOut, BillingSettingsOut, BillingSettingsUpdate,
    CancelSubscriptionRequest, OrganisationSubscriptionOut,
    SelectPlanRequest, SubscriptionAuditLogOut,
    SubscriptionPlanOut, SubscriptionPlanUpdate, SubscriptionUsageOut,
)
from app.services import billing_service, subscription_service
from app.services.subscription_limits import get_usage

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])


# ── Plan catalogue (public for authenticated users) ────────────────────────────

@router.get("/plans", response_model=list[SubscriptionPlanOut])
async def list_plans(db: AsyncSession = Depends(get_db)) -> list:
    return await subscription_service.get_all_plans(db)


# ── Current subscription ───────────────────────────────────────────────────────

@router.get("/current", response_model=OrganisationSubscriptionOut)
async def get_current_subscription(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrganisationSubscriptionOut:
    if not current_user.profile.organisation_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No organisation associated with this account",
        )
    sub = await subscription_service.get_or_create_subscription(
        current_user.profile.organisation_id, db
    )
    return sub


@router.get("/usage", response_model=SubscriptionUsageOut)
async def get_subscription_usage(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubscriptionUsageOut:
    if not current_user.profile.organisation_id:
        return SubscriptionUsageOut(
            properties_used=0, properties_limit=-1,
            units_used=0, units_limit=-1,
            users_used=0, users_limit=-1,
            storage_used_mb=0.0, storage_limit_mb=-1,
            properties_percent=0.0, units_percent=0.0,
            users_percent=0.0, storage_percent=0.0,
        )
    usage = await get_usage(current_user.profile.organisation_id, db)
    return SubscriptionUsageOut(**usage)


# ── Plan selection ─────────────────────────────────────────────────────────────

@router.post("/select-plan", response_model=OrganisationSubscriptionOut)
async def select_plan(
    body: SelectPlanRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrganisationSubscriptionOut:
    if not current_user.is_owner_or_manager():
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Owner or manager required.")
    sub = await subscription_service.initiate_plan_change(
        org_id=current_user.profile.organisation_id,
        plan_id=body.plan_id,
        billing_cycle=body.billing_cycle,
        currency=body.currency,
        actor_id=current_user.profile.id,
        db=db,
    )
    return sub


@router.post("/cancel", response_model=OrganisationSubscriptionOut)
async def cancel_subscription(
    body: CancelSubscriptionRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrganisationSubscriptionOut:
    if not current_user.is_owner_or_manager():
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Owner or manager required.")
    sub = await subscription_service.get_or_create_subscription(
        current_user.profile.organisation_id, db
    )
    return await subscription_service.cancel_subscription(
        sub, current_user.profile.id, body.reason, db
    )


@router.get("/audit-log", response_model=list[SubscriptionAuditLogOut])
async def get_audit_log(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list:
    if not current_user.profile.organisation_id:
        return []
    return await subscription_service.get_audit_log(
        current_user.profile.organisation_id, db, limit, offset
    )
