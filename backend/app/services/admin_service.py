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

from app.models.organisation import Organisation
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
