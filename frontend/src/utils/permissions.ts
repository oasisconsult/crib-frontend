import type { UserRole } from "@/types";

type Permission =
  | "properties:read"
  | "properties:write"
  | "properties:delete"
  | "units:read"
  | "units:write"
  | "tenants:read"
  | "tenants:write"
  | "tenants:invite"
  | "leases:read"
  | "leases:write"
  | "leases:terminate"
  | "payments:read"
  | "payments:write"
  | "payments:export"
  | "inspections:read"
  | "inspections:write"
  | "inspections:approve"
  | "maintenance:read"
  | "maintenance:write"
  | "notifications:read"
  | "notifications:send"
  | "notifications:templates"
  | "analytics:read"
  | "admin:read"
  | "admin:write";

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  superadmin: [
    "properties:read",
    "properties:write",
    "properties:delete",
    "units:read",
    "units:write",
    "tenants:read",
    "tenants:write",
    "tenants:invite",
    "leases:read",
    "leases:write",
    "leases:terminate",
    "payments:read",
    "payments:write",
    "payments:export",
    "inspections:read",
    "inspections:write",
    "inspections:approve",
    "maintenance:read",
    "maintenance:write",
    "notifications:read",
    "notifications:send",
    "notifications:templates",
    "analytics:read",
    "admin:read",
    "admin:write",
  ],
  owner: [
    "properties:read",
    "properties:write",
    "properties:delete",
    "units:read",
    "units:write",
    "tenants:read",
    "tenants:write",
    "tenants:invite",
    "leases:read",
    "leases:write",
    "leases:terminate",
    "payments:read",
    "payments:write",
    "payments:export",
    "inspections:read",
    "inspections:write",
    "inspections:approve",
    "maintenance:read",
    "maintenance:write",
    "notifications:read",
    "notifications:send",
    "notifications:templates",
    "analytics:read",
  ],
  // Property manager — CRUD on operations, read-only on financials
  manager: [
    "properties:read",
    "properties:write",
    "units:read",
    "units:write",
    "tenants:read",
    "tenants:write",
    "tenants:invite",
    "leases:read",
    "leases:write",
    "payments:read",
    "inspections:read",
    "inspections:write",
    "inspections:approve",
    "maintenance:read",
    "maintenance:write",
    "notifications:read",
    "notifications:send",
    "analytics:read",
  ],
  tenant: [
    "properties:read",
    "leases:read",
    "payments:read",
    "inspections:read",
    "maintenance:read",
    "maintenance:write",
    "notifications:read",
  ],
  maintenance: [
    "inspections:read",
    "maintenance:read",
  ],
};

/**
 * True if the given single role has the permission.
 * Prefer hasRoleSetPermission() for multi-role users.
 */
export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/**
 * True if ANY of the supplied roles grants the permission.
 * Use this for users who may hold multiple roles simultaneously.
 */
export function hasRoleSetPermission(
  roles: UserRole[],
  permission: Permission,
): boolean {
  return roles.some((r) => hasPermission(r, permission));
}

export function hasAnyPermission(
  role: UserRole,
  permissions: Permission[],
): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

export function hasRoleSetAnyPermission(
  roles: UserRole[],
  permissions: Permission[],
): boolean {
  return permissions.some((p) => hasRoleSetPermission(roles, p));
}

export function hasAllPermissions(
  role: UserRole,
  permissions: Permission[],
): boolean {
  return permissions.every((p) => hasPermission(role, p));
}

export function getRouteRole(pathname: string): UserRole | null {
  if (pathname.startsWith("/admin")) return "superadmin";
  if (pathname.startsWith("/portal")) return "tenant";
  return null; // dashboard routes available to owner + manager + superadmin
}
