"""
Admin — User Role Assignments

Superadmin-only endpoints for viewing and managing Crib role assignments.

GET  /admin/user-roles                      — paginated profile list (search by email/name)
GET  /admin/user-roles/{sub}                — single user detail with RBAC role assignments
GET  /admin/user-roles/available-roles      — list of valid Crib role names
POST /admin/user-roles/{sub}/assign         — assign a role (RBAC DB + profile + session bust)
DELETE /admin/user-roles/{sub}/roles/{role} — revoke a role  (RBAC DB + session bust)
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_superadmin
from app.core.database import get_db
from app.models.profile import Profile
from app.schemas.common import CamelModel

router = APIRouter(prefix="/admin/user-roles", tags=["admin"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class RoleAssignmentOut(CamelModel):
    role_name: str
    is_active: bool
    assigned_at: str | None


class AdminUserOut(CamelModel):
    id: str
    logto_sub: str
    display_name: str | None
    email: str | None
    role: str         # current primary role from profile
    organisation_id: str | None
    created_at: str


class AdminUserDetailOut(AdminUserOut):
    rbac_roles: list[RoleAssignmentOut]


class AdminUserPage(CamelModel):
    data: list[AdminUserOut]
    total: int
    page: int
    page_size: int
    has_next: bool


class AssignRoleRequest(CamelModel):
    role_name: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _profile_to_out(p: Profile) -> AdminUserOut:
    return AdminUserOut(
        id=str(p.id),
        logto_sub=p.logto_sub,
        display_name=p.display_name,
        email=p.email,
        role=p.role,
        organisation_id=str(p.organisation_id) if p.organisation_id else None,
        created_at=p.created_at.isoformat(),  # type: ignore[union-attr]
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get(
    "/available-roles",
    response_model=list[str],
    dependencies=[Depends(require_superadmin())],
)
async def list_available_roles() -> list[str]:
    """Return all Crib role names in priority order."""
    from app.services.rbac_admin_service import list_role_names_ordered
    return await list_role_names_ordered()


@router.get(
    "",
    response_model=AdminUserPage,
    dependencies=[Depends(require_superadmin())],
)
async def list_users(
    search: str | None = Query(None, description="Filter by name or email"),
    role: str | None = Query(None, description="Filter by role"),
    page: int = Query(1, ge=1),
    page_size: int = Query(40, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> AdminUserPage:
    """Paginated list of all Crib profiles, optionally filtered."""
    stmt = select(Profile).where(
        Profile.anonymised_at.is_(None),
        Profile.deleted_at.is_(None),
    )
    if search:
        term = f"%{search.lower()}%"
        stmt = stmt.where(
            or_(
                Profile.display_name.ilike(term),
                Profile.email.ilike(term),
            )
        )
    if role:
        stmt = stmt.where(Profile.role == role)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total: int = (await db.execute(count_stmt)).scalar_one()

    stmt = stmt.order_by(Profile.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    profiles = (await db.execute(stmt)).scalars().all()

    return AdminUserPage(
        data=[_profile_to_out(p) for p in profiles],
        total=total,
        page=page,
        page_size=page_size,
        has_next=(page * page_size) < total,
    )


@router.get(
    "/{sub}",
    response_model=AdminUserDetailOut,
    dependencies=[Depends(require_superadmin())],
)
async def get_user(sub: str, db: AsyncSession = Depends(get_db)) -> AdminUserDetailOut:
    """Single user detail including all RBAC role assignments from the shared RBAC DB."""
    result = await db.execute(select(Profile).where(Profile.logto_sub == sub))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    from app.services.rbac_user_service import get_user_crib_roles
    rbac_rows = await get_user_crib_roles(sub)

    return AdminUserDetailOut(
        **_profile_to_out(profile).model_dump(),
        rbac_roles=[
            RoleAssignmentOut(
                role_name=r["role_name"],
                is_active=r["is_active"],
                assigned_at=r["assigned_at"],
            )
            for r in rbac_rows
        ],
    )


@router.post(
    "/{sub}/assign",
    response_model=AdminUserDetailOut,
    dependencies=[Depends(require_superadmin())],
    status_code=status.HTTP_200_OK,
)
async def assign_role(
    sub: str,
    body: AssignRoleRequest,
    db: AsyncSession = Depends(get_db),
) -> AdminUserDetailOut:
    """
    Assign a Crib role to a user.

    Writes to the RBAC DB, updates profile.role, and invalidates the user's
    session so the next request picks up the new role without a logout.
    """
    result = await db.execute(select(Profile).where(Profile.logto_sub == sub))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Validate that the role exists in the shared RBAC DB
    from app.services.rbac_admin_service import is_valid_crib_role
    if not await is_valid_crib_role(body.role_name):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Role '{body.role_name}' is not a valid Crib role",
        )

    # Write to RBAC DB
    from app.services.rbac_user_service import provision_crib_role
    await provision_crib_role(
        logto_sub=sub,
        email=profile.email,
        role_name=body.role_name,
    )

    # Update profile.role
    profile.role = body.role_name
    await db.flush()

    # Invalidate session — next request returns 401 + X-Crib-Auth-Refresh: true
    # so the frontend silently refreshes the token and picks up the new role.
    from app.core.session_cache import invalidate_session
    await invalidate_session(sub)

    from app.services.rbac_user_service import get_user_crib_roles
    rbac_rows = await get_user_crib_roles(sub)

    return AdminUserDetailOut(
        **_profile_to_out(profile).model_dump(),
        rbac_roles=[
            RoleAssignmentOut(
                role_name=r["role_name"],
                is_active=r["is_active"],
                assigned_at=r["assigned_at"],
            )
            for r in rbac_rows
        ],
    )


@router.delete(
    "/{sub}/roles/{role_name}",
    response_model=AdminUserDetailOut,
    dependencies=[Depends(require_superadmin())],
)
async def revoke_role(
    sub: str,
    role_name: str,
    db: AsyncSession = Depends(get_db),
) -> AdminUserDetailOut:
    """
    Revoke a Crib role assignment.

    Deactivates the RBAC DB row and invalidates the session.  If this was
    the user's primary role (profile.role), downgrades to "tenant".
    """
    result = await db.execute(select(Profile).where(Profile.logto_sub == sub))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    from app.services.rbac_user_service import revoke_crib_role, get_user_crib_roles
    await revoke_crib_role(logto_sub=sub, role_name=role_name)

    # If the revoked role was the user's primary, downgrade to tenant
    if profile.role == role_name:
        profile.role = "tenant"
        await db.flush()

    from app.core.session_cache import invalidate_session
    await invalidate_session(sub)

    rbac_rows = await get_user_crib_roles(sub)
    return AdminUserDetailOut(
        **_profile_to_out(profile).model_dump(),
        rbac_roles=[
            RoleAssignmentOut(
                role_name=r["role_name"],
                is_active=r["is_active"],
                assigned_at=r["assigned_at"],
            )
            for r in rbac_rows
        ],
    )
