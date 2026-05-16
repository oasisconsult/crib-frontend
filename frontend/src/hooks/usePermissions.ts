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

  const hasHigherRole = roles.some((r) => ["owner", "manager", "superadmin"].includes(r));
  // A user is a read-only agency-managed landlord only if they have the
  // 'landlord' role AND no higher role. If 'owner' or 'manager' is also
  // present (e.g. from a failed role-cleanup leaving both in the JWT),
  // the higher role takes precedence — matching backend _primary_role logic.
  const isLandlord = roles.includes("landlord") && !hasHigherRole;
  const isReadOnly = isLandlord;

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
    /** True for landlords — they have view-only access to agency-managed properties. */
    isReadOnly,
    /** True when the user can perform write operations. */
    canWrite: !isReadOnly,
  };
}
