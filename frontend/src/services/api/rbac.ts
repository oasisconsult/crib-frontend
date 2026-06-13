import { apiDelete, apiGet, apiPost, apiPut } from "./client";

export interface RoleOut {
  id: number;
  name: string;
  description: string | null;
  priority: number;
}

export interface PermissionOut {
  id: number;
  resource: string;
  action: string;
}

export interface RoleDetailOut extends RoleOut {
  permissions: PermissionOut[];
}

export interface PermissionRef {
  id: number;
  action: string;
}

export interface ResourceOut {
  id: number;
  name: string;
  permissions: PermissionRef[];
}

export const rbacApi = {
  // Roles
  listRoles: () =>
    apiGet<RoleOut[]>("/admin/rbac/roles"),

  getRole: (id: number) =>
    apiGet<RoleDetailOut>(`/admin/rbac/roles/${id}`),

  createRole: (body: { name: string; description?: string; priority?: number }) =>
    apiPost<RoleOut>("/admin/rbac/roles", body),

  deleteRole: (id: number) =>
    apiDelete<void>(`/admin/rbac/roles/${id}`),

  // Role permissions
  listRolePermissions: (roleId: number) =>
    apiGet<PermissionOut[]>(`/admin/rbac/roles/${roleId}/permissions`),

  replaceRolePermissions: (roleId: number, permissionIds: number[]) =>
    apiPut<PermissionOut[]>(`/admin/rbac/roles/${roleId}/permissions`, {
      permissions: permissionIds,
    }),

  grantPermission: (roleId: number, permissionId: number) =>
    apiPost<PermissionOut>(`/admin/rbac/roles/${roleId}/permissions`, {
      permission_id: permissionId,
    }),

  revokePermission: (roleId: number, permissionId: number) =>
    apiDelete<void>(`/admin/rbac/roles/${roleId}/permissions/${permissionId}`),

  // Resources
  listResources: () =>
    apiGet<ResourceOut[]>("/admin/rbac/resources"),

  createResource: (name: string) =>
    apiPost<ResourceOut>("/admin/rbac/resources", { name }),
};
