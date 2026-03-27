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
    "notifications:read",
    "notifications:send",
    "notifications:templates",
    "analytics:read",
    "admin:read",
    "admin:write",
  ],
  landlord: [
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
    "notifications:read",
    "notifications:send",
    "notifications:templates",
    "analytics:read",
  ],
  tenant: [
    "properties:read",
    "leases:read",
    "payments:read",
    "inspections:read",
    "notifications:read",
  ],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function hasAnyPermission(
  role: UserRole,
  permissions: Permission[],
): boolean {
  return permissions.some((p) => hasPermission(role, p));
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
  return null; // dashboard routes available to landlord + superadmin
}
