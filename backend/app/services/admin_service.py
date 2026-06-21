"""
Admin-level service: soft-delete lifecycle for Profiles and Organisations.

Functions here require superadmin role at the API layer.  They enforce
industry-standard soft-deletion (deleted_at timestamp) and GDPR-compliant
patterns for personal data.

Lifecycle summary
─────────────────
Profile (system users / landlords)
  deactivate  → deleted_at = now(), Logto account suspended
  restore     → deleted_at = None,  Logto account re-enabled

Organisation (agencies)
  archive     → deleted_at = now(), is_active = False
                All manager profiles in that org also deactivated.
                Properties remain but are excluded from dashboards.
  restore     → deleted_at = None,  is_active = True
                Manager profiles in that org also restored.
  transfer_properties → reassigns organisation_id on all (non-archived)
                        properties from old_org to target_org, enabling a
                        new agency to take over an archived agency's portfolio.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import structlog
from fastapi import HTTPException, status as http_status
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agency_invite import AgencyInvite
from app.models.landlord_invite import LandlordPropertyAccess
from app.models.organisation import Organisation, Plan
from app.models.profile import Profile
from app.models.property import Property, Unit

log = structlog.get_logger(__name__)


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _get_profile(profile_id: uuid.UUID, db: AsyncSession) -> Profile:
    result = await db.execute(select(Profile).where(Profile.id == profile_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND, detail="Profile not found"
        )
    return profile


async def _get_org(org_id: uuid.UUID, db: AsyncSession) -> Organisation:
    result = await db.execute(select(Organisation).where(Organisation.id == org_id))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND, detail="Organisation not found"
        )
    return org


async def _set_logto_user_active(logto_sub: str, active: bool) -> None:
    """Suspend or re-enable a Logto user account. Non-fatal on failure."""
    from app.services import logto_service
    try:
        await logto_service.set_user_suspended(logto_sub, suspended=not active)
    except Exception:
        log.warning(
            "admin.logto_user_active_failed",
            logto_sub=logto_sub,
            active=active,
            exc_info=True,
        )


# ── Profile lifecycle ─────────────────────────────────────────────────────────

async def deactivate_profile(
    profile_id: uuid.UUID, db: AsyncSession, requester_id: uuid.UUID | None = None
) -> None:
    """
    Soft-delete a system user profile.
    Sets deleted_at and suspends their Logto account so they cannot log in.
    LandlordPropertyAccess rows are kept so access is restored on un-delete.
    """
    profile = await _get_profile(profile_id, db)

    if profile.id == requester_id:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="You cannot deactivate your own account",
        )
    if profile.deleted_at is not None:
        raise HTTPException(
            status_code=http_status.HTTP_409_CONFLICT, detail="Profile is already deactivated"
        )

    now = datetime.now(timezone.utc)
    profile.deleted_at = now
    await db.flush()

    await _set_logto_user_active(profile.logto_sub, active=False)
    log.info("admin.profile_deactivated", profile_id=str(profile_id))


async def restore_profile(profile_id: uuid.UUID, db: AsyncSession) -> None:
    """Re-activate a soft-deleted profile and re-enable the Logto account."""
    profile = await _get_profile(profile_id, db)

    if profile.deleted_at is None:
        raise HTTPException(
            status_code=http_status.HTTP_409_CONFLICT, detail="Profile is already active"
        )

    profile.deleted_at = None
    await db.flush()

    await _set_logto_user_active(profile.logto_sub, active=True)
    log.info("admin.profile_restored", profile_id=str(profile_id))


# ── Organisation lifecycle ────────────────────────────────────────────────────

async def archive_organisation(org_id: uuid.UUID, db: AsyncSession) -> None:
    """
    Archive (soft-delete) an organisation.
    - Sets deleted_at + is_active=False on the org.
    - Cascades deactivation to all manager/owner profiles in this org.
    - Properties are NOT deleted — they are retained and transferable.
    """
    org = await _get_org(org_id, db)

    if org.deleted_at is not None:
        raise HTTPException(
            status_code=http_status.HTTP_409_CONFLICT, detail="Organisation is already archived"
        )

    now = datetime.now(timezone.utc)
    org.deleted_at = now
    org.is_active = False

    # Deactivate all manager/owner profiles in this org
    profiles_result = await db.execute(
        select(Profile).where(
            Profile.organisation_id == org_id,
            Profile.deleted_at.is_(None),
        )
    )
    profiles = profiles_result.scalars().all()
    for p in profiles:
        p.deleted_at = now

    await db.flush()

    # Suspend Logto accounts (non-fatal)
    for p in profiles:
        await _set_logto_user_active(p.logto_sub, active=False)

    log.info(
        "admin.org_archived",
        org_id=str(org_id),
        profiles_deactivated=len(profiles),
    )


async def restore_organisation(org_id: uuid.UUID, db: AsyncSession) -> None:
    """
    Restore an archived organisation.
    - Clears deleted_at + sets is_active=True on the org.
    - Re-activates all profiles that were deactivated *at the same time*
      as the org was archived (i.e., their deleted_at matches the org's).
    """
    org = await _get_org(org_id, db)

    if org.deleted_at is None:
        raise HTTPException(
            status_code=http_status.HTTP_409_CONFLICT, detail="Organisation is not archived"
        )

    archived_at = org.deleted_at
    org.deleted_at = None
    org.is_active = True

    # Restore profiles that were deactivated as part of this archive action
    # (matching deleted_at within a 5-second window to account for clock skew)
    from sqlalchemy import func as sa_func
    profiles_result = await db.execute(
        select(Profile).where(
            Profile.organisation_id == org_id,
            Profile.deleted_at.is_not(None),
            sa_func.abs(
                sa_func.extract("epoch", Profile.deleted_at - archived_at)
            ) < 5,
        )
    )
    profiles = profiles_result.scalars().all()
    for p in profiles:
        p.deleted_at = None

    await db.flush()

    for p in profiles:
        await _set_logto_user_active(p.logto_sub, active=True)

    log.info(
        "admin.org_restored",
        org_id=str(org_id),
        profiles_restored=len(profiles),
    )


async def transfer_properties(
    source_org_id: uuid.UUID, target_org_id: uuid.UUID, db: AsyncSession
) -> int:
    """
    Bulk-reassign all non-archived properties from source_org to target_org.
    Typically used when a new agency takes over an archived agency's portfolio.
    Returns the number of properties transferred.
    """
    # Both orgs must exist
    await _get_org(source_org_id, db)
    target_org = await _get_org(target_org_id, db)

    if target_org.deleted_at is not None:
        raise HTTPException(
            status_code=http_status.HTTP_409_CONFLICT,
            detail="Target organisation is archived — restore it first",
        )

    result = await db.execute(
        update(Property)
        .where(
            Property.organisation_id == source_org_id,
            Property.deleted_at.is_(None),
        )
        .values(organisation_id=target_org_id)
        .returning(Property.id)
    )
    transferred = len(result.fetchall())
    await db.flush()

    log.info(
        "admin.properties_transferred",
        source_org=str(source_org_id),
        target_org=str(target_org_id),
        count=transferred,
    )
    return transferred


# ── Independent landlord lifecycle ────────────────────────────────────────────


async def migrate_landlord_to_personal_org(
    profile_id: uuid.UUID, db: AsyncSession
) -> tuple[Organisation, bool, bool]:
    """
    Migrate an existing landlord profile to a personal organisation.

    Used when a landlord was incorrectly linked to another org (e.g. they were
    added to the inviting agency's org but should be self-managing).

    Steps:
      1. Create a personal DB Organisation row.
      2. Create a personal Logto org and add the landlord as owner.
      3. Update profile: organisation_id → personal org, role → owner, is_read_only → False.
      4. Remove the landlord from the old org in Logto (non-fatal).

    Returns the newly created personal Organisation.
    """
    import secrets as _secrets
    import re as _re
    from app.services import logto_service

    profile = await _get_profile(profile_id, db)

    # Capture the old Logto org before we change anything — needed for cleanup.
    old_logto_org_id = profile.logto_org_id

    # Derive a slug from the display name or email
    raw = (profile.display_name or profile.email or "landlord").strip()
    base_slug = _re.sub(r"[^\w-]", "-", raw.lower())[:28]
    slug = f"{base_slug}-{_secrets.token_hex(4)}"

    first, *rest = raw.split()
    last = rest[-1] if rest else ""

    personal_org = Organisation(
        logto_org_id=f"org_personal_{_secrets.token_hex(6)}",  # temp; replaced below
        name=f"{raw}'s Properties",
        slug=slug,
        plan=Plan.free,
        currency="UGX",
        settings={},
        payment_settings={},
    )
    db.add(personal_org)
    await db.flush()

    # Create actual Logto org and update the placeholder logto_org_id
    if profile.logto_sub:
        logto_org_id = await logto_service.create_personal_org_with_owner(
            user_id=profile.logto_sub,
            first_name=first,
            last_name=last,
        )
        if logto_org_id:
            personal_org.logto_org_id = logto_org_id
            await db.flush()

    old_org_id = profile.organisation_id

    profile.organisation_id = personal_org.id
    profile.logto_org_id = personal_org.logto_org_id
    profile.role = "owner"
    profile.is_read_only = False
    await db.flush()

    # Remove user from the old Logto org so their JWT stops carrying the old
    # org_id. Without this _upsert_profile will re-sync the profile back to the
    # old org on every subsequent request.
    logto_removed = False
    role_removed = False
    if profile.logto_sub:
        if old_logto_org_id and old_logto_org_id != personal_org.logto_org_id:
            logto_removed = await logto_service.remove_user_from_org(old_logto_org_id, profile.logto_sub)
        else:
            logto_removed = True  # No old org to remove from
        # Remove the landlord app-level role so it doesn't appear in the JWT
        # (otherwise the frontend treats the user as read-only via roles.includes("landlord"))
        role_removed = await logto_service.remove_user_app_role(profile.logto_sub, "landlord")

    log.info(
        "admin.landlord_migrated_to_personal_org",
        profile_id=str(profile_id),
        old_org=str(old_org_id),
        new_org=str(personal_org.id),
        logto_removed=logto_removed,
        role_removed=role_removed,
    )
    return personal_org, logto_removed, role_removed


async def repair_landlord_org(
    profile_id: uuid.UUID,
    target_org_id: uuid.UUID,
    db: AsyncSession,
) -> dict:
    """
    Repair a landlord profile that ended up with the wrong org context after
    migration (e.g. _upsert_profile reverted it because the old Logto org
    membership was never cleaned up).

    Steps:
      1. Set profile.organisation_id → target_org (the personal org).
      2. Remove user from ALL Logto orgs except the target org.
      3. Remove 'landlord' app-level role from user.
      4. Set profile.role → 'owner', is_read_only → False.

    The user must log out and back in for the JWT to reflect the new org context.
    """
    profile = await _get_profile(profile_id, db)
    target_org = await _get_org(target_org_id, db)

    if target_org.deleted_at is not None:
        raise HTTPException(
            status_code=http_status.HTTP_409_CONFLICT,
            detail="Target organisation is archived",
        )

    from app.services import logto_service

    # Update the DB profile to point at the correct personal org
    profile.organisation_id = target_org.id
    profile.logto_org_id = target_org.logto_org_id
    profile.role = "owner"
    profile.is_read_only = False
    await db.flush()

    removed_from: list[str] = []
    if profile.logto_sub:
        # Remove from every Logto org except the target one
        current_orgs = await logto_service.get_user_logto_org_ids(profile.logto_sub)
        for org_id in current_orgs:
            if org_id != target_org.logto_org_id:
                ok = await logto_service.remove_user_from_org(org_id, profile.logto_sub)
                if ok:
                    removed_from.append(org_id)

        # Remove the landlord app-level role
        await logto_service.remove_user_app_role(profile.logto_sub, "landlord")

    log.info(
        "admin.landlord_org_repaired",
        profile_id=str(profile_id),
        target_org=str(target_org_id),
        removed_from_orgs=removed_from,
    )
    return {
        "profile_id": str(profile_id),
        "target_org_id": str(target_org_id),
        "target_org_name": target_org.name,
        "removed_from_logto_orgs": len(removed_from),
        "message": (
            f"Profile repaired. Removed from {len(removed_from)} old Logto org(s). "
            "Ask the user to log out and back in for the change to take effect."
        ),
    }


async def assign_landlord_to_agency(
    profile_id: uuid.UUID,
    agency_org_id: uuid.UUID,
    property_ids: list[uuid.UUID] | None,
    db: AsyncSession,
) -> dict:
    """
    Transfer an independent landlord to agency management.

    Steps:
      1. Validate landlord profile and target agency.
      2. Move specified properties (or all from their personal org) to agency org.
      3. Create LandlordPropertyAccess grants for each transferred property.
      4. Update profile: organisation_id → agency, role → landlord, is_read_only → True.
      5. Archive their personal org.
      6. Add landlord to agency's Logto org with landlord role.

    Returns a summary dict with counts.
    """
    from app.services import logto_service

    profile = await _get_profile(profile_id, db)
    agency_org = await _get_org(agency_org_id, db)

    if agency_org.deleted_at is not None:
        raise HTTPException(
            status_code=http_status.HTTP_409_CONFLICT,
            detail="Target agency is archived — restore it first",
        )

    personal_org_id = profile.organisation_id

    # Determine which properties to transfer
    if property_ids:
        prop_filter = Property.id.in_(property_ids)
    else:
        prop_filter = Property.organisation_id == personal_org_id  # type: ignore

    props_result = await db.execute(
        select(Property).where(
            Property.organisation_id == personal_org_id,
            Property.deleted_at.is_(None),
            prop_filter,
        )
    )
    properties = props_result.scalars().all()

    # Transfer properties to agency org
    for prop in properties:
        prop.organisation_id = agency_org_id

    # Create LandlordPropertyAccess for each transferred property
    for prop in properties:
        exists = await db.scalar(
            select(LandlordPropertyAccess.property_id).where(
                LandlordPropertyAccess.landlord_profile_id == profile_id,
                LandlordPropertyAccess.property_id == prop.id,
            )
        )
        if not exists:
            db.add(LandlordPropertyAccess(
                landlord_profile_id=profile_id,
                property_id=prop.id,
                is_read_only=True,
            ))

    # Update profile to agency scope
    profile.organisation_id = agency_org_id
    profile.logto_org_id = agency_org.logto_org_id
    profile.role = "landlord"
    profile.is_read_only = True
    await db.flush()

    # Archive personal org (properties are gone so nothing is lost)
    if personal_org_id:
        await archive_organisation(personal_org_id, db)

    # Add landlord to agency's Logto org (non-fatal)
    if profile.logto_sub and agency_org.logto_org_id:
        try:
            await logto_service.set_user_suspended(profile.logto_sub, suspended=False)
        except Exception:
            pass

    log.info(
        "admin.landlord_assigned_to_agency",
        profile_id=str(profile_id),
        agency_org=str(agency_org_id),
        properties_transferred=len(properties),
    )
    return {
        "properties_transferred": len(properties),
        "agency_org_id": str(agency_org_id),
    }

# ── Admin portal: agency + landlord listings ──────────────────────────────────

def _prop_address(addr: dict | None) -> str:
    if not addr:
        return ""
    parts = [addr.get("street"), addr.get("city"), addr.get("state")]
    return ", ".join(x for x in parts if x)


async def list_agencies(
    db: "AsyncSession",
    page: int = 1,
    page_size: int = 25,
    search: str | None = None,
) -> dict:
    from app.models.agency_invite import AgencyInvite as _AgencyInvite
    agency_ids_sq = (
        select(_AgencyInvite.organisation_id)
        .where(_AgencyInvite.status == "accepted", _AgencyInvite.organisation_id.isnot(None))
        .scalar_subquery()
    )
    stmt = select(Organisation).where(Organisation.id.in_(agency_ids_sq))
    if search:
        stmt = stmt.where(Organisation.name.ilike(f"%{search}%"))

    total = (await db.scalar(select(func.count()).select_from(stmt.subquery()))) or 0
    orgs = (
        await db.execute(
            stmt.order_by(Organisation.deleted_at.is_(None).desc(), Organisation.name)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().all()

    org_ids = [o.id for o in orgs]
    if not org_ids:
        return {"data": [], "total": total, "page": page, "pageSize": page_size}

    prop_rows = (await db.execute(
        select(
            Property.organisation_id,
            func.count(Property.id).label("total"),
            func.count(Property.id).filter(Property.status == "active").label("active"),
        )
        .where(Property.organisation_id.in_(org_ids), Property.deleted_at.is_(None))
        .group_by(Property.organisation_id)
    )).all()
    prop_by_org = {r.organisation_id: r for r in prop_rows}

    mgr_rows = (await db.execute(
        select(Profile.organisation_id, func.count(Profile.id).label("cnt"))
        .where(
            Profile.organisation_id.in_(org_ids),
            Profile.role.in_(["manager", "owner"]),
            Profile.deleted_at.is_(None),
        )
        .group_by(Profile.organisation_id)
    )).all()
    mgr_by_org = {r.organisation_id: r.cnt for r in mgr_rows}

    ll_rows = (await db.execute(
        select(Profile.organisation_id, func.count(Profile.id).label("cnt"))
        .where(
            Profile.organisation_id.in_(org_ids),
            Profile.role == "landlord",
            Profile.deleted_at.is_(None),
        )
        .group_by(Profile.organisation_id)
    )).all()
    ll_by_org = {r.organisation_id: r.cnt for r in ll_rows}

    def _agency_row(o: "Organisation") -> dict:
        p = prop_by_org.get(o.id)
        total_p = int(p.total) if p else 0
        active_p = int(p.active) if p else 0
        plan_val = o.plan.value if hasattr(o.plan, "value") else str(o.plan)
        return {
            "id": str(o.id),
            "name": o.name,
            "slug": o.slug,
            "plan": plan_val,
            "country": o.country,
            "currency": o.currency,
            "totalProperties": total_p,
            "activeProperties": active_p,
            "inactiveProperties": total_p - active_p,
            "managerCount": mgr_by_org.get(o.id, 0),
            "landlordCount": ll_by_org.get(o.id, 0),
            "isArchived": o.deleted_at is not None,
            "createdAt": o.created_at.isoformat(),
        }

    return {
        "data": [_agency_row(o) for o in orgs],
        "total": total,
        "page": page,
        "pageSize": page_size,
    }


async def get_agency_detail(org_id: "uuid.UUID", db: "AsyncSession") -> dict:
    org = await _get_org(org_id, db)

    props = (await db.execute(
        select(Property)
        .where(Property.organisation_id == org_id, Property.deleted_at.is_(None))
        .order_by(Property.status, Property.name)
    )).scalars().all()

    prop_ids = [p.id for p in props]
    unit_counts: dict = {}
    revenue_by_prop: dict = {}
    if prop_ids:
        unit_rows = (await db.execute(
            select(
                Unit.property_id,
                func.count(Unit.id).label("cnt"),
                func.sum(Unit.monthly_rent).filter(Unit.status == "occupied").label("rev"),
            )
            .where(Unit.property_id.in_(prop_ids), Unit.deleted_at.is_(None))
            .group_by(Unit.property_id)
        )).all()
        unit_counts = {r.property_id: int(r.cnt) for r in unit_rows}
        revenue_by_prop = {r.property_id: float(r.rev or 0) for r in unit_rows}

    managers = (await db.execute(
        select(Profile)
        .where(
            Profile.organisation_id == org_id,
            Profile.role.in_(["manager", "owner"]),
            Profile.deleted_at.is_(None),
        )
    )).scalars().all()

    landlords = (await db.execute(
        select(Profile)
        .where(
            Profile.organisation_id == org_id,
            Profile.role == "landlord",
            Profile.deleted_at.is_(None),
        )
    )).scalars().all()

    ll_ids = [ll.id for ll in landlords]
    ll_prop_counts: dict = {}
    if ll_ids:
        ll_count_rows = (await db.execute(
            select(
                LandlordPropertyAccess.landlord_profile_id,
                func.count(LandlordPropertyAccess.property_id).label("cnt"),
            )
            .where(LandlordPropertyAccess.landlord_profile_id.in_(ll_ids))
            .group_by(LandlordPropertyAccess.landlord_profile_id)
        )).all()
        ll_prop_counts = {r.landlord_profile_id: int(r.cnt) for r in ll_count_rows}

    active_count = sum(1 for p in props if (p.status.value if hasattr(p.status, "value") else p.status) == "active")
    total_revenue = sum(revenue_by_prop.values())
    settings = org.settings or {}
    plan_val = org.plan.value if hasattr(org.plan, "value") else str(org.plan)

    return {
        "id": str(org.id),
        "name": org.name,
        "slug": org.slug,
        "plan": plan_val,
        "country": org.country,
        "currency": org.currency,
        "contactEmail": settings.get("contact_email"),
        "contactPhone": settings.get("contact_phone"),
        "address": settings.get("address"),
        "totalProperties": len(props),
        "activeProperties": active_count,
        "inactiveProperties": len(props) - active_count,
        "totalMonthlyRevenue": total_revenue,
        "managerCount": len(managers),
        "landlordCount": len(landlords),
        "isArchived": org.deleted_at is not None,
        "createdAt": org.created_at.isoformat(),
        "managers": [
            {"id": str(m.id), "displayName": m.display_name, "email": m.email, "role": m.role}
            for m in managers
        ],
        "landlords": [
            {
                "id": str(ll.id),
                "displayName": ll.display_name,
                "email": ll.email,
                "propertyCount": ll_prop_counts.get(ll.id, 0),
            }
            for ll in landlords
        ],
        "properties": [
            {
                "id": str(p.id),
                "name": p.name,
                "type": p.type.value if hasattr(p.type, "value") else str(p.type),
                "status": p.status.value if hasattr(p.status, "value") else str(p.status),
                "unitCount": unit_counts.get(p.id, 1 if p.is_single_unit else 0),
                "monthlyRevenue": revenue_by_prop.get(p.id, 0),
                "address": _prop_address(p.address),
            }
            for p in props
        ],
    }


async def list_landlords(
    db: "AsyncSession",
    page: int = 1,
    page_size: int = 25,
    search: str | None = None,
) -> dict:
    base_where = [
        Profile.role.in_(["landlord", "owner"]),
        Profile.anonymised_at.is_(None),
        Profile.deleted_at.is_(None),
    ]
    if search:
        term = f"%{search}%"
        base_where.append(or_(Profile.display_name.ilike(term), Profile.email.ilike(term)))

    total = (await db.scalar(select(func.count(Profile.id)).where(*base_where))) or 0

    rows = (await db.execute(
        select(Profile, Organisation.name.label("org_name"))
        .outerjoin(Organisation, Organisation.id == Profile.organisation_id)
        .where(*base_where)
        .order_by(Profile.display_name.asc().nullslast())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )).all()

    profiles = [r[0] for r in rows]
    org_names = {r[0].id: r[1] for r in rows}
    if not profiles:
        return {"data": [], "total": total, "page": page, "pageSize": page_size}

    owner_profiles = [p for p in profiles if p.role == "owner"]
    landlord_profiles = [p for p in profiles if p.role == "landlord"]

    owner_prop_counts: dict = {}
    if owner_profiles:
        owner_org_ids = [p.organisation_id for p in owner_profiles if p.organisation_id]
        if owner_org_ids:
            o_rows = (await db.execute(
                select(
                    Property.organisation_id,
                    func.count(Property.id).label("total"),
                    func.count(Property.id).filter(Property.status == "active").label("active"),
                )
                .where(Property.organisation_id.in_(owner_org_ids), Property.deleted_at.is_(None))
                .group_by(Property.organisation_id)
            )).all()
            org_counts = {r.organisation_id: r for r in o_rows}
            for p in owner_profiles:
                r = org_counts.get(p.organisation_id)
                owner_prop_counts[p.id] = {
                    "total": int(r.total) if r else 0,
                    "active": int(r.active) if r else 0,
                }

    ll_prop_counts: dict = {}
    if landlord_profiles:
        ll_ids = [p.id for p in landlord_profiles]
        ll_rows = (await db.execute(
            select(
                LandlordPropertyAccess.landlord_profile_id,
                func.count(Property.id).label("total"),
                func.count(Property.id).filter(Property.status == "active").label("active"),
            )
            .join(Property, Property.id == LandlordPropertyAccess.property_id)
            .where(
                LandlordPropertyAccess.landlord_profile_id.in_(ll_ids),
                Property.deleted_at.is_(None),
            )
            .group_by(LandlordPropertyAccess.landlord_profile_id)
        )).all()
        for r in ll_rows:
            ll_prop_counts[r.landlord_profile_id] = {
                "total": int(r.total),
                "active": int(r.active),
            }

    def _landlord_row(p: "Profile") -> dict:
        is_owner = p.role == "owner"
        counts = (owner_prop_counts if is_owner else ll_prop_counts).get(
            p.id, {"total": 0, "active": 0}
        )
        return {
            "id": str(p.id),
            "displayName": p.display_name,
            "email": p.email,
            "role": p.role,
            "isReadOnly": p.is_read_only,
            "orgId": str(p.organisation_id) if p.organisation_id else None,
            "orgName": org_names.get(p.id),
            "propertyCount": counts["total"],
            "activePropertyCount": counts["active"],
            "type": "independent" if is_owner else "agency_managed",
            "createdAt": p.created_at.isoformat(),
        }

    return {
        "data": [_landlord_row(p) for p in profiles],
        "total": total,
        "page": page,
        "pageSize": page_size,
    }


async def get_landlord_detail(profile_id: "uuid.UUID", db: "AsyncSession") -> dict:
    row = (await db.execute(
        select(Profile, Organisation.name.label("org_name"))
        .outerjoin(Organisation, Organisation.id == Profile.organisation_id)
        .where(Profile.id == profile_id, Profile.anonymised_at.is_(None))
    )).one_or_none()

    if not row:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Profile not found")
    profile, org_name = row
    if profile.role not in ("landlord", "owner"):
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Profile is not a landlord or owner",
        )

    if profile.role == "owner" and profile.organisation_id:
        props = (await db.execute(
            select(Property)
            .where(
                Property.organisation_id == profile.organisation_id,
                Property.deleted_at.is_(None),
            )
            .order_by(Property.status, Property.name)
        )).scalars().all()
    else:
        props = (await db.execute(
            select(Property)
            .join(LandlordPropertyAccess, LandlordPropertyAccess.property_id == Property.id)
            .where(
                LandlordPropertyAccess.landlord_profile_id == profile_id,
                Property.deleted_at.is_(None),
            )
            .order_by(Property.status, Property.name)
        )).scalars().all()

    prop_ids = [p.id for p in props]
    unit_counts: dict = {}
    revenue_by_prop: dict = {}
    if prop_ids:
        unit_rows = (await db.execute(
            select(
                Unit.property_id,
                func.count(Unit.id).label("cnt"),
                func.sum(Unit.monthly_rent).filter(Unit.status == "occupied").label("rev"),
            )
            .where(Unit.property_id.in_(prop_ids), Unit.deleted_at.is_(None))
            .group_by(Unit.property_id)
        )).all()
        unit_counts = {r.property_id: int(r.cnt) for r in unit_rows}
        revenue_by_prop = {r.property_id: float(r.rev or 0) for r in unit_rows}

    active_count = sum(
        1 for p in props
        if (p.status.value if hasattr(p.status, "value") else p.status) == "active"
    )
    total_revenue = sum(revenue_by_prop.values())

    return {
        "id": str(profile.id),
        "displayName": profile.display_name,
        "email": profile.email,
        "phone": getattr(profile, "phone", None),
        "role": profile.role,
        "isReadOnly": profile.is_read_only,
        "orgId": str(profile.organisation_id) if profile.organisation_id else None,
        "orgName": org_name,
        "propertyCount": len(props),
        "activePropertyCount": active_count,
        "inactivePropertyCount": len(props) - active_count,
        "totalMonthlyRevenue": total_revenue,
        "type": "independent" if profile.role == "owner" else "agency_managed",
        "createdAt": profile.created_at.isoformat(),
        "properties": [
            {
                "id": str(p.id),
                "name": p.name,
                "type": p.type.value if hasattr(p.type, "value") else str(p.type),
                "status": p.status.value if hasattr(p.status, "value") else str(p.status),
                "unitCount": unit_counts.get(p.id, 1 if p.is_single_unit else 0),
                "monthlyRevenue": revenue_by_prop.get(p.id, 0),
                "address": _prop_address(p.address),
            }
            for p in props
        ],
    }
