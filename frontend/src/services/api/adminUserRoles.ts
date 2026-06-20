import { apiDelete, apiGet, apiPost } from "./client";

export interface RoleAssignment {
  roleName: string;
  isActive: boolean;
  assignedAt: string | null;
}

export interface AdminUser {
  id: string;
  logtoSub: string;
  displayName: string | null;
  email: string | null;
  role: string;
  organisationId: string | null;
  createdAt: string;
}

export interface AdminUserDetail extends AdminUser {
  rbacRoles: RoleAssignment[];
}

export interface AdminUserPage {
  data: AdminUser[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
}

export const adminUserRolesApi = {
  listUsers: (params?: { search?: string; role?: string; page?: number; pageSize?: number }) =>
    apiGet<AdminUserPage>("/admin/user-roles", params as Record<string, unknown>),

  getUser: (sub: string) =>
    apiGet<AdminUserDetail>(`/admin/user-roles/${sub}`),

  availableRoles: () =>
    apiGet<string[]>("/admin/user-roles/available-roles"),

  assignRole: (sub: string, roleName: string) =>
    apiPost<AdminUserDetail>(`/admin/user-roles/${sub}/assign`, { roleName }),

  revokeRole: (sub: string, roleName: string) =>
    apiDelete<AdminUserDetail>(`/admin/user-roles/${sub}/roles/${roleName}`),
};
