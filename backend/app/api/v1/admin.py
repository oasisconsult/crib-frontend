"""
Superadmin-only endpoints for soft-deletion lifecycle management.

POST /admin/organisations/{id}/archive          — archive org + cascade to profiles
POST /admin/organisations/{id}/restore          — restore org + cascade to profiles
POST /admin/organisations/{id}/transfer-properties — reassign properties to new org

POST /admin/profiles/{id}/deactivate            — soft-delete a system user
POST /admin/profiles/{id}/restore               — restore a deactivated profile

POST /admin/landlords/{id}/migrate-to-personal-org — move landlord to own personal org
POST /admin/landlords/{id}/assign-to-agency        — transfer landlord to agency management
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, require_superadmin
from app.core.database import get_db
from app.models.organisation import Organisation
from app.models.profile import Profile
from app.services import admin_service

router = APIRouter(prefix="/admin", tags=["admin"])


# ── Search helpers ─────────────────────────────────────────────────────────────

class ProfileSearchResult(BaseModel):
    id: str
    display_name: str | None
    email: str | None
    role: str
    organisation_id: str | None


class OrgSearchResult(BaseModel):
    id: str
    name: str
    slug: str
    is_archived: bool


@router.get(
    "/search/profiles",
    response_model=list[ProfileSearchResult],
    dependencies=[Depends(require_superadmin())],
)
async def search_profiles(
    q: str = Query(..., min_length=1, description="Name or email fragment"),
    role: str | None = Query(None, description="Filter by role (e.g. 'landlord')"),
    db: AsyncSession = Depends(get_db),
) -> list[ProfileSearchResult]:
    """
    Full-text search over profiles by display_name or email.
    Optionally filter by role. Excludes anonymised profiles.
    Returns up to 20 results.
    """
    term = f"%{q.lower()}%"
    stmt = (
        select(Profile)
        .where(
            Profile.anonymised_at.is_(None),
            or_(
                Profile.display_name.ilike(term),
                Profile.email.ilike(term),
            ),
        )
        .limit(20)
    )
    if role:
        stmt = stmt.where(Profile.role == role)

    rows = (await db.execute(stmt)).scalars().all()
    return [
        ProfileSearchResult(
            id=str(r.id),
            display_name=r.display_name,
            email=r.email,
            role=r.role,
            organisation_id=str(r.organisation_id) if r.organisation_id else None,
        )
        for r in rows
    ]


@router.get(
    "/search/organisations",
    response_model=list[OrgSearchResult],
    dependencies=[Depends(require_superadmin())],
)
async def search_organisations(
    q: str = Query(..., min_length=1, description="Organisation name fragment"),
    active_only: bool = Query(False, description="When true, exclude archived orgs"),
    db: AsyncSession = Depends(get_db),
) -> list[OrgSearchResult]:
    """Search organisations by name. Returns up to 20 results."""
    stmt = (
        select(Organisation)
        .where(Organisation.name.ilike(f"%{q}%"))
        .limit(20)
    )
    if active_only:
        stmt = stmt.where(Organisation.deleted_at.is_(None))

    rows = (await db.execute(stmt)).scalars().all()
    return [
        OrgSearchResult(
            id=str(r.id),
            name=r.name,
            slug=r.slug,
            is_archived=r.deleted_at is not None,
        )
        for r in rows
    ]


# ── Organisation lifecycle ────────────────────────────────────────────────────

@router.post(
    "/organisations/{org_id}/archive",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    dependencies=[Depends(require_superadmin())],
)
async def archive_organisation(
    org_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    Archive an organisation (soft-delete).
    Deactivates all manager/owner profiles in the org and suspends their
    Logto accounts. Properties are retained and transferable to a new agency.
    """
    await admin_service.archive_organisation(org_id, db)
    await db.commit()


@router.post(
    "/organisations/{org_id}/restore",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    dependencies=[Depends(require_superadmin())],
)
async def restore_organisation(
    org_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Restore an archived organisation and re-activate its manager profiles."""
    await admin_service.restore_organisation(org_id, db)
    await db.commit()


class TransferPropertiesBody(BaseModel):
    target_org_id: uuid.UUID


class TransferPropertiesResponse(BaseModel):
    transferred: int
    message: str


@router.post(
    "/organisations/{org_id}/transfer-properties",
    response_model=TransferPropertiesResponse,
    dependencies=[Depends(require_superadmin())],
)
async def transfer_properties(
    org_id: uuid.UUID,
    body: TransferPropertiesBody,
    db: AsyncSession = Depends(get_db),
) -> TransferPropertiesResponse:
    """
    Bulk-reassign all non-archived properties from org_id to target_org_id.
    Used when a new agency takes over an archived agency's property portfolio.
    """
    count = await admin_service.transfer_properties(org_id, body.target_org_id, db)
    await db.commit()
    return TransferPropertiesResponse(
        transferred=count,
        message=f"{count} properties transferred to the new organisation.",
    )


# ── Profile lifecycle ─────────────────────────────────────────────────────────

@router.post(
    "/profiles/{profile_id}/deactivate",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    dependencies=[Depends(require_superadmin())],
)
async def deactivate_profile(
    profile_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Soft-delete a system-user profile (manager, owner, landlord).
    Suspends their Logto account; LandlordPropertyAccess rows are kept.
    """
    await admin_service.deactivate_profile(profile_id, db, requester_id=current_user.id)
    await db.commit()


@router.post(
    "/profiles/{profile_id}/restore",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    dependencies=[Depends(require_superadmin())],
)
async def restore_profile(
    profile_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Restore a soft-deleted profile and re-enable their Logto account."""
    await admin_service.restore_profile(profile_id, db)
    await db.commit()


# ── Landlord lifecycle ────────────────────────────────────────────────────────

class MigrateToPersonalOrgResponse(BaseModel):
    org_id: str
    org_name: str
    logto_org_id: str
    message: str


@router.post(
    "/landlords/{profile_id}/migrate-to-personal-org",
    response_model=MigrateToPersonalOrgResponse,
    dependencies=[Depends(require_superadmin())],
)
async def migrate_landlord_to_personal_org(
    profile_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> MigrateToPersonalOrgResponse:
    """
    Move an existing landlord to their own personal organisation.

    Use this when a landlord was incorrectly scoped to another agency's org
    (e.g. they were added under the inviting agency at invite time). Creates a
    new personal Logto org + DB Organisation, updates their profile to owner,
    and removes them from the old org.
    """
    org = await admin_service.migrate_landlord_to_personal_org(profile_id, db)
    await db.commit()
    return MigrateToPersonalOrgResponse(
        org_id=str(org.id),
        org_name=org.name,
        logto_org_id=org.logto_org_id,
        message=f"Landlord migrated to personal organisation '{org.name}'.",
    )


class AssignToAgencyBody(BaseModel):
    agency_org_id: uuid.UUID
    property_ids: list[uuid.UUID] | None = None


class AssignToAgencyResponse(BaseModel):
    properties_transferred: int
    agency_org_id: str
    message: str


@router.post(
    "/landlords/{profile_id}/assign-to-agency",
    response_model=AssignToAgencyResponse,
    dependencies=[Depends(require_superadmin())],
)
async def assign_landlord_to_agency(
    profile_id: uuid.UUID,
    body: AssignToAgencyBody,
    db: AsyncSession = Depends(get_db),
) -> AssignToAgencyResponse:
    """
    Transfer a self-managing landlord into agency management.

    Moves their properties to the agency org, creates LandlordPropertyAccess
    grants, updates their profile to landlord role (read-only), and archives
    their personal org. Pass property_ids to transfer specific properties, or
    omit to transfer all properties from their personal org.
    """
    result = await admin_service.assign_landlord_to_agency(
        profile_id, body.agency_org_id, body.property_ids, db
    )
    await db.commit()
    return AssignToAgencyResponse(
        properties_transferred=result["properties_transferred"],
        agency_org_id=result["agency_org_id"],
        message=f"{result['properties_transferred']} properties transferred to agency.",
    )


class RepairOrgBody(BaseModel):
    target_org_id: uuid.UUID


class RepairOrgResponse(BaseModel):
    profile_id: str
    target_org_id: str
    target_org_name: str
    removed_from_logto_orgs: int
    message: str


@router.post(
    "/landlords/{profile_id}/repair-org",
    response_model=RepairOrgResponse,
    dependencies=[Depends(require_superadmin())],
)
async def repair_landlord_org(
    profile_id: uuid.UUID,
    body: RepairOrgBody,
    db: AsyncSession = Depends(get_db),
) -> RepairOrgResponse:
    """
    Fix a landlord whose profile reverted to the wrong org after migration.

    This happens when the old Logto org membership was not cleaned up, causing
    _upsert_profile to re-sync the profile back to the old org on every login.

    Steps performed:
      - Points the profile at target_org (their personal org).
      - Removes the user from every Logto org except target_org.
      - Removes the 'landlord' app-level role from their Logto account.
      - Sets role=owner, is_read_only=False in the DB profile.

    The user must log out and back in after this action for the new JWT
    (with the correct org context) to take effect.
    """
    result = await admin_service.repair_landlord_org(profile_id, body.target_org_id, db)
    await db.commit()
    return RepairOrgResponse(**result)
