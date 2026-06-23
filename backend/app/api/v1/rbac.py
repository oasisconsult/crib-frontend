"""
RBAC admin endpoints — superadmin only.

All role and permission data is read from and written to the shared RBAC
database (rbac_roles, rbac_resources, rbac_permissions, rbac_role_permissions)
via the geobox-rbac RoleService.  The local `roles`/`resources`/`permissions`
tables remain in place but are no longer authoritative.

Endpoints:
  GET  /admin/rbac/roles                        — list all roles
  POST /admin/rbac/roles                        — create a new role
  GET  /admin/rbac/roles/{role_id}              — single role detail with permissions
  DELETE /admin/rbac/roles/{role_id}            — delete a custom role
  GET  /admin/rbac/roles/{role_id}/permissions  — permissions for a role
  PUT  /admin/rbac/roles/{role_id}/permissions  — replace full permission set (bulk)
  POST /admin/rbac/roles/{role_id}/permissions  — grant a single permission
  DELETE /admin/rbac/roles/{role_id}/permissions/{perm_id} — revoke a permission
  GET  /admin/rbac/resources                    — list resources + available actions
  POST /admin/rbac/resources                    — register a new resource
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from rbac.models.role import Permission, Resource, Role, RolePermission
from rbac.services.role_service import RoleService

from app.api.deps import CurrentUser, require_superadmin
from app.services.rbac_admin_service import (
    get_role_service,
    invalidate_priority_cache,
    list_resources_rbac,
    permission_detail_rbac,
)

router = APIRouter(prefix="/admin/rbac", tags=["admin"])
_super = Depends(require_superadmin())


# ── Schemas ───────────────────────────────────────────────────────────────────


class RoleCreate(BaseModel):
    name: str = Field(..., max_length=50)
    display_name: str | None = Field(None, max_length=100)
    description: str | None = None
    priority: int = Field(99, ge=0, le=999)


class RoleOut(BaseModel):
    id: str           # UUID string from shared RBAC DB
    name: str
    display_name: str | None
    description: str | None
    priority: int
    is_system: bool

    @classmethod
    def from_role(cls, r: Role) -> "RoleOut":
        return cls(
            id=str(r.id),
            name=r.name,
            display_name=r.display_name,
            description=r.description,
            priority=r.priority,
            is_system=r.is_system,
        )


class PermissionOut(BaseModel):
    id: str           # UUID string
    resource: str
    action: str


class RoleDetailOut(RoleOut):
    permissions: list[PermissionOut]


class PermissionRef(BaseModel):
    id: str           # UUID string
    action: str


class ResourceOut(BaseModel):
    id: str           # UUID string
    name: str
    permissions: list[PermissionRef]


class ResourceCreate(BaseModel):
    name: str = Field(..., max_length=100)


class BulkPermissionSet(BaseModel):
    """Replace all permissions for a role with this exact set."""
    permissions: list[str] = Field(..., description="Permission UUID strings to grant")


class GrantPermission(BaseModel):
    permission_id: str   # UUID string


# ── Helpers ───────────────────────────────────────────────────────────────────


def _uuid(value: str, label: str = "ID") -> UUID:
    try:
        return UUID(value)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid {label}: '{value}' is not a valid UUID",
        )


async def _get_role_or_404(role_id: str, svc: RoleService) -> Role:
    role = await svc.get_role(_uuid(role_id, "role_id"))
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    return role


async def _permission_out(svc: RoleService, role_id: UUID) -> list[PermissionOut]:
    rows = await permission_detail_rbac(svc.db, role_id)
    return [PermissionOut(id=perm_id, resource=resource, action=action) for resource, action, perm_id in rows]


# ── Roles ─────────────────────────────────────────────────────────────────────


@router.get("/roles", response_model=list[RoleOut])
async def list_roles(
    _: CurrentUser = _super,
    svc: RoleService = Depends(get_role_service),
):
    roles = await svc.list_roles()
    return [RoleOut.from_role(r) for r in roles]


@router.post("/roles", response_model=RoleOut, status_code=status.HTTP_201_CREATED)
async def create_role(
    body: RoleCreate,
    _: CurrentUser = _super,
    svc: RoleService = Depends(get_role_service),
):
    # Check for name collision
    existing = await svc.db.scalar(
        select(Role).where(Role.app_id == svc.app_id, Role.name == body.name)
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Role '{body.name}' already exists",
        )
    role = await svc.create_role(
        name=body.name,
        display_name=body.display_name,
        description=body.description,
        priority=body.priority,
    )
    invalidate_priority_cache()
    return RoleOut.from_role(role)


@router.get("/roles/{role_id}", response_model=RoleDetailOut)
async def get_role(
    role_id: str,
    _: CurrentUser = _super,
    svc: RoleService = Depends(get_role_service),
):
    role = await _get_role_or_404(role_id, svc)
    perms = await _permission_out(svc, role.id)
    return RoleDetailOut(
        id=str(role.id),
        name=role.name,
        display_name=role.display_name,
        description=role.description,
        priority=role.priority,
        is_system=role.is_system,
        permissions=perms,
    )


@router.delete("/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(
    role_id: str,
    _: CurrentUser = _super,
    svc: RoleService = Depends(get_role_service),
):
    role = await _get_role_or_404(role_id, svc)
    try:
        await svc.delete_role(role)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    invalidate_priority_cache()


# ── Role permissions ──────────────────────────────────────────────────────────


@router.get("/roles/{role_id}/permissions", response_model=list[PermissionOut])
async def list_role_permissions(
    role_id: str,
    _: CurrentUser = _super,
    svc: RoleService = Depends(get_role_service),
):
    role = await _get_role_or_404(role_id, svc)
    return await _permission_out(svc, role.id)


@router.put("/roles/{role_id}/permissions", response_model=list[PermissionOut])
async def replace_role_permissions(
    role_id: str,
    body: BulkPermissionSet,
    _: CurrentUser = _super,
    svc: RoleService = Depends(get_role_service),
):
    """Atomically replace a role's full permission set."""
    role = await _get_role_or_404(role_id, svc)

    perm_uuids = [_uuid(p, "permission_id") for p in body.permissions]

    # Verify all permission IDs belong to this app
    if perm_uuids:
        found = await svc.db.execute(
            select(Permission.id).where(
                Permission.id.in_(perm_uuids),
                Permission.app_id == svc.app_id,
            )
        )
        found_ids = {row.id for row in found}
        missing = set(perm_uuids) - found_ids
        if missing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown permission IDs: {[str(m) for m in missing]}",
            )

    await svc.replace_role_permissions(role, perm_uuids)
    return await _permission_out(svc, role.id)


@router.post(
    "/roles/{role_id}/permissions",
    response_model=PermissionOut,
    status_code=status.HTTP_201_CREATED,
)
async def grant_permission(
    role_id: str,
    body: GrantPermission,
    _: CurrentUser = _super,
    svc: RoleService = Depends(get_role_service),
):
    role = await _get_role_or_404(role_id, svc)

    perm = await svc.db.scalar(
        select(Permission)
        .join(Resource, Resource.id == Permission.resource_id)
        .where(Permission.id == _uuid(body.permission_id, "permission_id"), Permission.app_id == svc.app_id)
    )
    if perm is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Permission not found")

    await svc.grant_permission(role, perm)

    resource_name = await svc.db.scalar(
        select(Resource.name).where(Resource.id == perm.resource_id)
    )
    return PermissionOut(id=str(perm.id), resource=resource_name or "", action=perm.action)


@router.delete(
    "/roles/{role_id}/permissions/{permission_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def revoke_permission(
    role_id: str,
    permission_id: str,
    _: CurrentUser = _super,
    svc: RoleService = Depends(get_role_service),
):
    role = await _get_role_or_404(role_id, svc)

    perm = await svc.db.scalar(
        select(Permission).where(
            Permission.id == _uuid(permission_id, "permission_id"),
            Permission.app_id == svc.app_id,
        )
    )
    if perm is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Permission not found")

    await svc.revoke_permission(role, perm)


# ── Resources ─────────────────────────────────────────────────────────────────


@router.get("/resources", response_model=list[ResourceOut])
async def list_resources(
    _: CurrentUser = _super,
    svc: RoleService = Depends(get_role_service),
):
    rows = await list_resources_rbac(svc.db, svc.app_id)
    return [
        ResourceOut(
            id=r["id"],
            name=r["name"],
            permissions=[PermissionRef(id=p["id"], action=p["action"]) for p in r["permissions"]],
        )
        for r in rows
    ]


@router.post("/resources", response_model=ResourceOut, status_code=status.HTTP_201_CREATED)
async def create_resource(
    body: ResourceCreate,
    _: CurrentUser = _super,
    svc: RoleService = Depends(get_role_service),
):
    """Register a new resource with auto-generated CRUD permissions."""
    existing = await svc.db.scalar(
        select(Resource).where(Resource.app_id == svc.app_id, Resource.name == body.name)
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Resource '{body.name}' already exists",
        )

    resource = await svc.register_resource(name=body.name, auto_create_crud=True)
    await svc.db.flush()

    rows = await list_resources_rbac(svc.db, svc.app_id)
    for r in rows:
        if r["id"] == str(resource.id):
            return ResourceOut(
                id=r["id"],
                name=r["name"],
                permissions=[PermissionRef(id=p["id"], action=p["action"]) for p in r["permissions"]],
            )

    # Fallback if not yet visible (flush timing)
    return ResourceOut(id=str(resource.id), name=resource.name, permissions=[])
