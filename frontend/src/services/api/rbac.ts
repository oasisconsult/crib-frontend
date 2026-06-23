import { apiDelete, apiGet, apiPost, apiPut } from "./client";

export interface RoleOut {
  id: string;           // UUID from shared RBAC DB
  name: string;
  display_name: string | null;
  description: string | null;
  priority: number;
  is_system: boolean;
}

export interface PermissionOut {
  id: string;           // UUID
  resource: string;
  action: string;
}

export interface RoleDetailOut extends RoleOut {
  permissions: PermissionOut[];
}

export interface PermissionRef {
  id: string;           // UUID
  action: string;
}

export interface ResourceOut {
  id: string;           // UUID
  name: string;
  permissions: PermissionRef[];
}

export const rbacApi = {
  // Roles
  listRoles: () =>
    apiGet<RoleOut[]>("/admin/rbac/roles"),

  getRole: (id: string) =>
    apiGet<RoleDetailOut>(`/admin/rbac/roles/${id}`),

  createRole: (body: { name: string; display_name?: string; description?: string; priority?: number }) =>
    apiPost<RoleOut>("/admin/rbac/roles", body),

  deleteRole: (id: string) =>
    apiDelete<void>(`/admin/rbac/roles/${id}`),

  // Role permissions
  listRolePermissions: (roleId: string) =>
    apiGet<PermissionOut[]>(`/admin/rbac/roles/${roleId}/permissions`),

  replaceRolePermissions: (roleId: string, permissionIds: string[]) =>
    apiPut<PermissionOut[]>(`/admin/rbac/roles/${roleId}/permissions`, {
      permissions: permissionIds,
    }),

  grantPermission: (roleId: string, permissionId: string) =>
    apiPost<PermissionOut>(`/admin/rbac/roles/${roleId}/permissions`, {
      permission_id: permissionId,
    }),

  revokePermission: (roleId: string, permissionId: string) =>
    apiDelete<void>(`/admin/rbac/roles/${roleId}/permissions/${permissionId}`),

  // Resources
  listResources: () =>
    apiGet<ResourceOut[]>("/admin/rbac/resources"),

  createResource: (name: string) =>
    apiPost<ResourceOut>("/admin/rbac/resources", { name }),
};
