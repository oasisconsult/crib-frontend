"use client";

import { useAppStore } from "@/store/useAppStore";
import { hasPermission, hasAnyPermission } from "@/utils/permissions";
import type { UserRole } from "@/types";

export function usePermissions() {
  const user = useAppStore((s) => s.user);
  const role = (user?.role ?? "tenant") as UserRole;

  return {
    role,
    can: (permission: Parameters<typeof hasPermission>[1]) =>
      hasPermission(role, permission),
    canAny: (permissions: Parameters<typeof hasAnyPermission>[1]) =>
      hasAnyPermission(role, permissions),
    isLandlord: role === "landlord" || role === "superadmin",
    isSuperAdmin: role === "superadmin",
    isTenant: role === "tenant",
  };
}
