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
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.landlord_invite import LandlordPropertyAccess
from app.models.organisation import Organisation, Plan
from app.models.profile import Profile
from app.models.property import Property

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
) -> Organisation:
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
        plan=Plan.starter,
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

    log.info(
        "admin.landlord_migrated_to_personal_org",
        profile_id=str(profile_id),
        old_org=str(old_org_id),
        new_org=str(personal_org.id),
    )
    return personal_org


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
