"use client";

/**
 * useRBAC — Multi-tenant RBAC hook
 *
 * Combines the user's role (from store) with org context to provide
 * permission checks. Emits audit events on access denial.
 */

import { useCallback } from "react";
import { useAppStore } from "@/store/useAppStore";
import { hasPermission, hasAnyPermission } from "@/utils/permissions";
import { emitAudit } from "@/lib/audit";
import type { UserRole } from "@/types";

type Permission = Parameters<typeof hasPermission>[1];

export function useRBAC() {
  const user = useAppStore((s) => s.user);
  const activeOrgId = useAppStore((s) => s.activeOrgId);
  const role = (user?.role ?? "tenant") as UserRole;

  const can = useCallback(
    (permission: Permission, { audit = false } = {}): boolean => {
      const allowed = hasPermission(role, permission);
      if (!allowed && audit) {
        emitAudit({
          action: "rbac.access_denied",
          userId: user?.id,
          orgId: activeOrgId ?? undefined,
          meta: { permission, role },
        });
      }
      return allowed;
    },
    [role, user?.id, activeOrgId],
  );

  const canAny = useCallback(
    (permissions: Parameters<typeof hasAnyPermission>[1]): boolean =>
      hasAnyPermission(role, permissions),
    [role],
  );

  return {
    role,
    orgId: activeOrgId,
    can,
    canAny,
    isLandlord: role === "landlord" || role === "superadmin",
    isManager: role === "manager",
    isSuperAdmin: role === "superadmin",
    isTenant: role === "tenant",
  };
}
