"""
Superadmin-only endpoints for soft-deletion lifecycle management.

POST /admin/organisations/{id}/archive          — archive org + cascade to profiles
POST /admin/organisations/{id}/restore          — restore org + cascade to profiles
POST /admin/organisations/{id}/transfer-properties — reassign properties to new org

POST /admin/profiles/{id}/deactivate            — soft-delete a system user
POST /admin/profiles/{id}/restore               — restore a deactivated profile
POST /admin/profiles/{sub}/invalidate-session   — force JWT refresh on next request

POST /admin/landlords/{id}/migrate-to-personal-org — move landlord to own personal org
POST /admin/landlords/{id}/assign-to-agency        — transfer landlord to agency management

GET  /admin/leases                              — list all leases across orgs (filterable)
PATCH /admin/leases/{id}/billing-rules          — overwrite billing fields on any lease
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, require_superadmin
from app.core.database import get_db
from app.models.organisation import Organisation
from app.models.profile import Profile
from app.schemas.lease import AdminLeaseOut, LeaseBillingRulesPatch
from app.services import admin_service
from app.services import lease_service as lease_svc

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
    logto_org_removed: bool
    landlord_role_removed: bool
    message: str
    warning: str | None = None


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

    Creates a new personal Logto org + DB Organisation, removes them from the
    old Logto org, strips the 'landlord' app role, and sets their profile to
    owner. The response includes booleans for each Logto step so the admin
    knows immediately if manual cleanup is needed.
    """
    org, logto_removed, role_removed = await admin_service.migrate_landlord_to_personal_org(
        profile_id, db
    )
    await db.commit()

    warning = None
    if not logto_removed or not role_removed:
        warning = (
            "Logto cleanup incomplete — user may still see old data after login. "
            "Use 'Remove from Logto org' in the Repair section to fix manually."
        )

    return MigrateToPersonalOrgResponse(
        org_id=str(org.id),
        org_name=org.name,
        logto_org_id=org.logto_org_id,
        logto_org_removed=logto_removed,
        landlord_role_removed=role_removed,
        message=f"Landlord migrated to personal organisation '{org.name}'.",
        warning=warning,
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


class RemoveFromLogtoOrgBody(BaseModel):
    logto_org_id: str  # The Logto org ID shown in the Logto admin console


class RemoveFromLogtoOrgResponse(BaseModel):
    profile_id: str
    logto_sub: str
    logto_org_id: str
    removed: bool
    role_removed: bool
    message: str


@router.post(
    "/landlords/{profile_id}/remove-from-logto-org",
    response_model=RemoveFromLogtoOrgResponse,
    dependencies=[Depends(require_superadmin())],
)
async def remove_landlord_from_logto_org(
    profile_id: uuid.UUID,
    body: RemoveFromLogtoOrgBody,
    db: AsyncSession = Depends(get_db),
) -> RemoveFromLogtoOrgResponse:
    """
    Directly remove a landlord from a specific Logto organisation.

    Use this when a landlord's Logto org membership wasn't cleaned up during
    migration. The Logto org ID is visible in the Logto admin console
    (e.g. 'o90iciqf8717' shown next to the org name).

    Also removes the 'landlord' app-level role so it no longer appears in
    the JWT, which prevents the view-only banner from showing.

    The user must log out and back in after this for the new JWT to take effect.
    """
    from app.services import logto_service as ls

    result = await db.execute(select(Profile).where(Profile.id == profile_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    removed = await ls.remove_user_from_org(body.logto_org_id, profile.logto_sub)
    role_removed = await ls.remove_user_app_role(profile.logto_sub, "landlord")

    # Also fix the DB profile if it currently points at the wrong org
    org_result = await db.execute(
        select(Organisation).where(Organisation.logto_org_id == body.logto_org_id)
    )
    wrong_org = org_result.scalar_one_or_none()
    if wrong_org and profile.organisation_id == wrong_org.id:
        # Profile is still pointing at the org we just removed them from.
        # Don't update here — the caller should use repair-org to set the correct one.
        pass

    await db.commit()

    return RemoveFromLogtoOrgResponse(
        profile_id=str(profile_id),
        logto_sub=profile.logto_sub,
        logto_org_id=body.logto_org_id,
        removed=removed,
        role_removed=role_removed,
        message=(
            f"Removed from Logto org {body.logto_org_id} (removed={removed}), "
            f"landlord role stripped (role_removed={role_removed}). "
            "Ask the user to log out and back in."
        ),
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
    Fix the DB profile so it points at the correct personal org, and clean up
    all Logto org memberships except the target one.
    """
    result = await admin_service.repair_landlord_org(profile_id, body.target_org_id, db)
    await db.commit()
    return RepairOrgResponse(**result)


# ── Session invalidation ───────────────────────────────────────────────────────


class InvalidateSessionResponse(BaseModel):
    logto_sub: str
    message: str


@router.post(
    "/profiles/{logto_sub}/invalidate-session",
    response_model=InvalidateSessionResponse,
    dependencies=[Depends(require_superadmin())],
)
async def invalidate_user_session(
    logto_sub: str,
) -> InvalidateSessionResponse:
    """
    Force the user's next API request to trigger a silent token refresh.

    Use after:
    - Changing a user's role in Logto admin
    - Updating a user's org membership
    - Any permission change that should take effect immediately rather than
      waiting for the user's JWT to expire naturally

    The user is NOT logged out — the next request returns 401 with
    X-Crib-Auth-Refresh: true, the frontend silently refreshes the token,
    and the retry succeeds with updated claims.
    """
    from app.core.session_cache import invalidate_session
    await invalidate_session(logto_sub)
    return InvalidateSessionResponse(
        logto_sub=logto_sub,
        message=f"Session for {logto_sub} will refresh on next request.",
    )


# ── Lease data-correction tools ───────────────────────────────────────────────

@router.get(
    "/leases",
    response_model=dict,
    dependencies=[Depends(require_superadmin())],
)
async def admin_list_leases(
    org_id: uuid.UUID | None = Query(None, alias="orgId", description="Filter by organisation"),
    lease_status: str | None = Query(None, alias="status", description="Filter by lease status"),
    zero_late_fee_only: bool = Query(
        False, alias="zeroLateFeeOnly",
        description="Only return leases whose late_fee_value is 0"
    ),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200, alias="pageSize"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    List leases across all organisations.

    Use ``zeroLateFeeOnly=true`` to surface CSV-imported leases that were
    created before the late-fee inheritance fix was applied.
    """
    return await lease_svc.admin_list_leases(
        db,
        org_id=org_id,
        lease_status=lease_status,
        zero_late_fee_only=zero_late_fee_only,
        page=page,
        page_size=page_size,
    )


@router.patch(
    "/leases/{lease_id}/billing-rules",
    response_model=AdminLeaseOut,
    dependencies=[Depends(require_superadmin())],
)
async def admin_patch_lease_billing_rules(
    lease_id: uuid.UUID,
    body: LeaseBillingRulesPatch,
    db: AsyncSession = Depends(get_db),
) -> AdminLeaseOut:
    """
    Overwrite billing rules on any lease regardless of its current status.

    Pass ``syncFromProperty: true`` to automatically pull all rules from the
    unit/property configuration — useful for bulk-correcting CSV-imported
    leases that were created with the wrong (hard-coded) billing values.

    Or supply individual fields to set them explicitly.

    This does NOT affect the lease agreement PDF until the agreement is
    regenerated — use ``POST /leases/{id}/generate-document`` after patching.
    """
    result = await lease_svc.admin_patch_lease_billing_rules(lease_id, body, db)
    await db.commit()
    return result
