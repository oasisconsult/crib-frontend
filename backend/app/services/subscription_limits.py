"""
Subscription feature-limit enforcement.

Called by route handlers BEFORE creating resources to ensure the org
has not exceeded its plan limits. Returns structured errors so the
frontend can show upgrade prompts.

-1 in any limit field means unlimited.
"""
from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organisation import Organisation
from app.models.property import Property, Unit
from app.models.profile import Profile


async def _get_active_plan_limits(org_id: uuid.UUID, db: AsyncSession) -> dict:
    """Fetch live plan limits for an organisation's active subscription."""
    from app.services.subscription_service import get_or_create_subscription

    sub = await get_or_create_subscription(org_id, db)
    plan = sub.plan
    return {
        "max_properties": plan.max_properties,
        "max_units": plan.max_units,
        "max_users": plan.max_users,
        "max_storage_mb": plan.max_storage_mb,
        "features": plan.features,
        "plan_slug": plan.slug,
        "plan_name": plan.name,
    }


async def _count_properties(org_id: uuid.UUID, db: AsyncSession) -> int:
    result = await db.execute(
        select(func.count()).select_from(Property).where(
            Property.organisation_id == org_id,
            Property.deleted_at.is_(None),
        )
    )
    return result.scalar_one() or 0


async def _count_units(org_id: uuid.UUID, db: AsyncSession) -> int:
    result = await db.execute(
        select(func.count()).select_from(Unit).join(
            Property, Unit.property_id == Property.id
        ).where(
            Property.organisation_id == org_id,
            Property.deleted_at.is_(None),
        )
    )
    return result.scalar_one() or 0


async def _count_users(org_id: uuid.UUID, db: AsyncSession) -> int:
    result = await db.execute(
        select(func.count()).select_from(Profile).where(
            Profile.organisation_id == org_id,
            Profile.deleted_at.is_(None) if hasattr(Profile, "deleted_at") else True,
        )
    )
    return result.scalar_one() or 0


def _limit_exceeded(current: int, limit: int) -> bool:
    """Returns True if the limit would be exceeded. -1 = unlimited."""
    return limit != -1 and current >= limit


async def check_property_limit(
    org_id: uuid.UUID, db: AsyncSession, *, adding: int = 1
) -> None:
    """
    Raise 402 if adding more properties would exceed the plan limit.

    :param adding: number of properties about to be created (default 1;
                   set to the import count for bulk operations).
    """
    limits = await _get_active_plan_limits(org_id, db)
    max_p = limits["max_properties"]
    if max_p == -1:
        return
    current = await _count_properties(org_id, db)
    if current + adding > max_p:
        available = max(max_p - current, 0)
        noun = "property" if max_p == 1 else "properties"
        detail = (
            f"Your {limits['plan_name']} plan allows up to {max_p} {noun}. "
            f"You currently have {current}."
        )
        if adding > 1:
            detail += (
                f" This operation would add {adding} "
                f"({'property' if adding == 1 else 'properties'}) "
                f"but only {available} {'slot is' if available == 1 else 'slots are'} available."
            )
        detail += " Upgrade your plan to add more properties."
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "code": "property_limit_exceeded",
                "message": detail,
                "current": current,
                "adding": adding,
                "limit": max_p,
                "available": available,
                "plan": limits["plan_slug"],
            },
        )


async def check_unit_limit(
    org_id: uuid.UUID, db: AsyncSession, *, adding: int = 1
) -> None:
    """
    Raise 402 if adding more units would exceed the plan limit.

    :param adding: number of units about to be created (default 1;
                   set to the batch/import count for bulk operations).
    """
    limits = await _get_active_plan_limits(org_id, db)
    max_u = limits["max_units"]
    if max_u == -1:
        return
    current = await _count_units(org_id, db)
    if current + adding > max_u:
        available = max(max_u - current, 0)
        detail = (
            f"Your {limits['plan_name']} plan allows up to {max_u} units. "
            f"You currently have {current}."
        )
        if adding > 1:
            detail += (
                f" This operation would add {adding} units "
                f"but only {available} {'slot is' if available == 1 else 'slots are'} available."
            )
        detail += " Upgrade your plan to add more units."
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "code": "unit_limit_exceeded",
                "message": detail,
                "current": current,
                "adding": adding,
                "limit": max_u,
                "available": available,
                "plan": limits["plan_slug"],
            },
        )


async def check_user_limit(org_id: uuid.UUID, db: AsyncSession) -> None:
    """Raise 402 if the org has reached its user/team-member limit."""
    limits = await _get_active_plan_limits(org_id, db)
    max_users = limits["max_users"]
    if max_users == -1:
        return
    current = await _count_users(org_id, db)
    if current >= max_users:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "code": "user_limit_exceeded",
                "message": f"Your {limits['plan_name']} plan allows up to {max_users} team members. "
                           "Upgrade to add more users.",
                "current": current,
                "limit": max_users,
                "plan": limits["plan_slug"],
            },
        )


async def check_feature_access(
    org_id: uuid.UUID,
    feature: str,
    db: AsyncSession,
) -> None:
    """Raise 402 if the org's plan does not include the requested feature."""
    limits = await _get_active_plan_limits(org_id, db)
    features = limits.get("features", {})
    if not features.get(feature, False):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "code": "feature_not_available",
                "message": f"The '{feature}' feature is not available on your "
                           f"{limits['plan_name']} plan. Upgrade to access it.",
                "feature": feature,
                "plan": limits["plan_slug"],
            },
        )


async def get_usage(org_id: uuid.UUID, db: AsyncSession) -> dict:
    """Return current usage counts and percentages for the org."""
    limits = await _get_active_plan_limits(org_id, db)

    properties_used = await _count_properties(org_id, db)
    units_used = await _count_units(org_id, db)
    users_used = await _count_users(org_id, db)

    def pct(used: int, limit: int) -> float:
        if limit == -1:
            return 0.0
        if limit == 0:
            return 100.0
        return min(round(used / limit * 100, 1), 100.0)

    return {
        "properties_used": properties_used,
        "properties_limit": limits["max_properties"],
        "properties_percent": pct(properties_used, limits["max_properties"]),
        "units_used": units_used,
        "units_limit": limits["max_units"],
        "units_percent": pct(units_used, limits["max_units"]),
        "users_used": users_used,
        "users_limit": limits["max_users"],
        "users_percent": pct(users_used, limits["max_users"]),
        "storage_used_mb": 0.0,           # placeholder — implement when storage metering is added
        "storage_limit_mb": limits["max_storage_mb"],
        "storage_percent": 0.0,
    }
