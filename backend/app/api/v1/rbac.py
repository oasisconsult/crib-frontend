"""
RBAC admin endpoints — superadmin only.

Manage roles, resources, and permission assignments at runtime without
requiring code deploys.

Endpoints:
  GET  /admin/rbac/roles                        — list all roles with their permission sets
  POST /admin/rbac/roles                        — create a new role
  GET  /admin/rbac/roles/{role_id}              — single role detail
  DELETE /admin/rbac/roles/{role_id}            — delete a custom role
  GET  /admin/rbac/roles/{role_id}/permissions  — list permissions for a role
  PUT  /admin/rbac/roles/{role_id}/permissions  — replace full permission set (bulk)
  POST /admin/rbac/roles/{role_id}/permissions  — grant a single permission
  DELETE /admin/rbac/roles/{role_id}/permissions/{perm_id} — revoke a single permission
  GET  /admin/rbac/resources                    — list all resources + available actions
  POST /admin/rbac/resources                    — register a new resource
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, require_superadmin
from app.core.database import get_db
from app.models.rbac import Permission, Resource, RoleModel, RolePermission
from app.services.policy_service import invalidate_role_cache

router = APIRouter(prefix="/admin/rbac", tags=["admin"])
_super = Depends(require_superadmin())


# ── Schemas ───────────────────────────────────────────────────────────────────


class RoleCreate(BaseModel):
    name: str = Field(..., max_length=50)
    description: str | None = None
    priority: int = Field(99, ge=0, le=999)


class RoleOut(BaseModel):
    id: int
    name: str
    description: str | None
    priority: int

    model_config = {"from_attributes": True}


class PermissionOut(BaseModel):
    id: int
    resource: str
    action: str

    model_config = {"from_attributes": True}


class RoleDetailOut(RoleOut):
    permissions: list[PermissionOut]


class ResourceOut(BaseModel):
    id: int
    name: str
    actions: list[str]

    model_config = {"from_attributes": True}


class ResourceCreate(BaseModel):
    name: str = Field(..., max_length=100)


class BulkPermissionSet(BaseModel):
    """Replace all permissions for a role with this exact set."""
    permissions: list[int] = Field(..., description="List of permission IDs to grant")


class GrantPermission(BaseModel):
    permission_id: int


# ── Helpers ───────────────────────────────────────────────────────────────────


async def _get_role_or_404(role_id: int, db: AsyncSession) -> RoleModel:
    result = await db.execute(select(RoleModel).where(RoleModel.id == role_id))
    role = result.scalar_one_or_none()
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    return role


async def _permission_detail(
    db: AsyncSession, role: RoleModel
) -> list[PermissionOut]:
    result = await db.execute(
        select(Resource.name, Permission.action, Permission.id)
        .join(Permission, Permission.resource_id == Resource.id)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .where(RolePermission.role_id == role.id)
        .order_by(Resource.name, Permission.action)
    )
    return [
        PermissionOut(id=row.id, resource=row.name, action=row.action)
        for row in result
    ]


# ── Roles ─────────────────────────────────────────────────────────────────────


@router.get("/roles", response_model=list[RoleOut])
async def list_roles(
    _: CurrentUser = _super,
    db: AsyncSession = Depends(get_db),
):
    """List all roles ordered by priority."""
    result = await db.execute(select(RoleModel).order_by(RoleModel.priority))
    return [RoleOut.model_validate(r) for r in result.scalars()]


@router.post("/roles", response_model=RoleOut, status_code=status.HTTP_201_CREATED)
async def create_role(
    body: RoleCreate,
    _: CurrentUser = _super,
    db: AsyncSession = Depends(get_db),
):
    """Create a new role. The role has no permissions until assigned."""
    existing = await db.execute(select(RoleModel).where(RoleModel.name == body.name))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Role '{body.name}' already exists",
        )
    role = RoleModel(name=body.name, description=body.description, priority=body.priority)
    db.add(role)
    await db.flush()
    await db.refresh(role)
    return RoleOut.model_validate(role)


@router.get("/roles/{role_id}", response_model=RoleDetailOut)
async def get_role(
    role_id: int,
    _: CurrentUser = _super,
    db: AsyncSession = Depends(get_db),
):
    """Return a role with its full permission list."""
    role = await _get_role_or_404(role_id, db)
    perms = await _permission_detail(db, role)
    return RoleDetailOut(
        id=role.id,
        name=role.name,
        description=role.description,
        priority=role.priority,
        permissions=perms,
    )


@router.delete("/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(
    role_id: int,
    _: CurrentUser = _super,
    db: AsyncSession = Depends(get_db),
):
    """
    Delete a role and all its permission assignments.
    Built-in roles (superadmin, owner, manager, tenant, maintenance) cannot be deleted.
    """
    role = await _get_role_or_404(role_id, db)
    _BUILTIN = {"superadmin", "owner", "manager", "tenant", "maintenance"}
    if role.name in _BUILTIN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Built-in role '{role.name}' cannot be deleted",
        )
    invalidate_role_cache(role.name)
    await db.delete(role)


# ── Role permissions ──────────────────────────────────────────────────────────


@router.get("/roles/{role_id}/permissions", response_model=list[PermissionOut])
async def list_role_permissions(
    role_id: int,
    _: CurrentUser = _super,
    db: AsyncSession = Depends(get_db),
):
    role = await _get_role_or_404(role_id, db)
    return await _permission_detail(db, role)


@router.put("/roles/{role_id}/permissions", response_model=list[PermissionOut])
async def replace_role_permissions(
    role_id: int,
    body: BulkPermissionSet,
    _: CurrentUser = _super,
    db: AsyncSession = Depends(get_db),
):
    """
    Replace the full permission set for a role atomically.
    Any permissions not in the list are revoked; any new ones are granted.
    """
    role = await _get_role_or_404(role_id, db)

    # Verify all permission IDs exist
    perm_result = await db.execute(
        select(Permission.id).where(Permission.id.in_(body.permissions))
    )
    found_ids = {row.id for row in perm_result}
    missing = set(body.permissions) - found_ids
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown permission IDs: {sorted(missing)}",
        )

    # Delete all existing assignments for this role
    await db.execute(delete(RolePermission).where(RolePermission.role_id == role_id))

    # Insert new assignments
    for perm_id in body.permissions:
        db.add(RolePermission(role_id=role_id, permission_id=perm_id))

    await db.flush()
    invalidate_role_cache(role.name)
    return await _permission_detail(db, role)


@router.post(
    "/roles/{role_id}/permissions",
    response_model=PermissionOut,
    status_code=status.HTTP_201_CREATED,
)
async def grant_permission(
    role_id: int,
    body: GrantPermission,
    _: CurrentUser = _super,
    db: AsyncSession = Depends(get_db),
):
    """Grant a single permission to a role."""
    role = await _get_role_or_404(role_id, db)

    perm_result = await db.execute(
        select(Permission, Resource.name.label("resource_name"))
        .join(Resource, Resource.id == Permission.resource_id)
        .where(Permission.id == body.permission_id)
    )
    row = perm_result.one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Permission not found")

    perm, resource_name = row

    # Idempotent — don't error on duplicate
    existing = await db.execute(
        select(RolePermission).where(
            RolePermission.role_id == role_id,
            RolePermission.permission_id == body.permission_id,
        )
    )
    if not existing.scalar_one_or_none():
        db.add(RolePermission(role_id=role_id, permission_id=body.permission_id))
        await db.flush()

    invalidate_role_cache(role.name)
    return PermissionOut(id=perm.id, resource=resource_name, action=perm.action)


@router.delete(
    "/roles/{role_id}/permissions/{permission_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def revoke_permission(
    role_id: int,
    permission_id: int,
    _: CurrentUser = _super,
    db: AsyncSession = Depends(get_db),
):
    """Revoke a single permission from a role."""
    role = await _get_role_or_404(role_id, db)
    await db.execute(
        delete(RolePermission).where(
            RolePermission.role_id == role_id,
            RolePermission.permission_id == permission_id,
        )
    )
    invalidate_role_cache(role.name)


# ── Resources ─────────────────────────────────────────────────────────────────


@router.get("/resources", response_model=list[ResourceOut])
async def list_resources(
    _: CurrentUser = _super,
    db: AsyncSession = Depends(get_db),
):
    """List all resources with their available actions."""
    result = await db.execute(
        select(Resource.id, Resource.name, Permission.action)
        .join(Permission, Permission.resource_id == Resource.id)
        .order_by(Resource.name, Permission.action)
    )
    # Group by resource
    resources: dict[int, ResourceOut] = {}
    for row in result:
        if row.id not in resources:
            resources[row.id] = ResourceOut(id=row.id, name=row.name, actions=[])
        resources[row.id].actions.append(row.action)
    return list(resources.values())


@router.post("/resources", response_model=ResourceOut, status_code=status.HTTP_201_CREATED)
async def create_resource(
    body: ResourceCreate,
    _: CurrentUser = _super,
    db: AsyncSession = Depends(get_db),
):
    """
    Register a new resource and auto-generate CRUD permissions for it.
    The superadmin role is automatically granted all four actions.
    """
    existing = await db.execute(select(Resource).where(Resource.name == body.name))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Resource '{body.name}' already exists",
        )

    resource = Resource(name=body.name)
    db.add(resource)
    await db.flush()
    await db.refresh(resource)

    # Auto-create CRUD permissions
    perms: list[Permission] = []
    for action in ("create", "read", "update", "delete"):
        p = Permission(resource_id=resource.id, action=action)
        db.add(p)
        perms.append(p)
    await db.flush()

    # Grant all four to superadmin
    sa_result = await db.execute(select(RoleModel).where(RoleModel.name == "superadmin"))
    superadmin = sa_result.scalar_one_or_none()
    if superadmin:
        for p in perms:
            await db.refresh(p)
            db.add(RolePermission(role_id=superadmin.id, permission_id=p.id))
        await db.flush()
        invalidate_role_cache("superadmin")

    return ResourceOut(id=resource.id, name=resource.name, actions=["create", "read", "update", "delete"])
