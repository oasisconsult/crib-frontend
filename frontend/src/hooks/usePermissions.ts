"use client";

import { useAppStore } from "@/store/useAppStore";
import {
  hasRoleSetPermission,
  hasRoleSetAnyPermission,
} from "@/utils/permissions";
import type { UserRole } from "@/types";

export function usePermissions() {
  const user = useAppStore((s) => s.user);

  // Prefer full roles list; fall back to primary role for backwards compat
  const roles: UserRole[] =
    user?.roles && user.roles.length > 0
      ? user.roles
      : user?.role
        ? [user.role as UserRole]
        : ["tenant"];

  const role = roles[0]; // primary role (highest priority)

  const isLandlord = roles.includes("landlord");
  const isReadOnly = isLandlord && (user?.isReadOnly ?? false);

  return {
    role,
    roles,
    can: (permission: Parameters<typeof hasRoleSetPermission>[1]) =>
      hasRoleSetPermission(roles, permission),
    canAny: (permissions: Parameters<typeof hasRoleSetAnyPermission>[1]) =>
      hasRoleSetAnyPermission(roles, permissions),
    isOwnerOrAbove: roles.some((r) => r === "owner" || r === "superadmin"),
    isManager: roles.includes("manager"),
    isSuperAdmin: roles.includes("superadmin"),
    isLandlord,
    isTenant: roles.includes("tenant"),
    isMaintenance: roles.includes("maintenance"),
    canManageOrg: roles.some((r) => ["owner", "manager", "superadmin"].includes(r)),
    /** True when the landlord's properties are agency-managed (view-only). */
    isReadOnly,
    /** True when the user can perform write operations. */
    canWrite: !isReadOnly,
  };
}
