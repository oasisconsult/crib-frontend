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
    isTenant: roles.includes("tenant"),
    isMaintenance: roles.includes("maintenance"),
  };
}
