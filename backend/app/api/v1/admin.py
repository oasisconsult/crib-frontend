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

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, require_superadmin
from app.core.database import get_db
from app.services import admin_service

router = APIRouter(prefix="/admin", tags=["admin"])


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
