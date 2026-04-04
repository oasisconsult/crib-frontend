"use client";

/**
 * useRBAC — Multi-tenant RBAC hook
 *
 * Combines the user's roles (from store) with org context to provide
 * permission checks. Emits audit events on access denial.
 * Uses the full roles array so multi-role users (e.g. superadmin+manager)
 * get the union of all their permissions.
 */

import { useCallback } from "react";
import { useAppStore } from "@/store/useAppStore";
import { hasRoleSetPermission, hasRoleSetAnyPermission } from "@/utils/permissions";
import { emitAudit } from "@/lib/audit";
import type { UserRole } from "@/types";

type Permission = Parameters<typeof hasRoleSetPermission>[1];

export function useRBAC() {
  const user = useAppStore((s) => s.user);
  const activeOrgId = useAppStore((s) => s.activeOrgId);

  const roles: UserRole[] =
    user?.roles && user.roles.length > 0
      ? user.roles
      : user?.role
        ? [user.role as UserRole]
        : ["tenant"];

  const role = roles[0]; // primary role

  const can = useCallback(
    (permission: Permission, { audit = false } = {}): boolean => {
      const allowed = hasRoleSetPermission(roles, permission);
      if (!allowed && audit) {
        emitAudit({
          action: "rbac.access_denied",
          userId: user?.id,
          orgId: activeOrgId ?? undefined,
          meta: { permission, roles },
        });
      }
      return allowed;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roles.join(","), user?.id, activeOrgId],
  );

  const canAny = useCallback(
    (permissions: Parameters<typeof hasRoleSetAnyPermission>[1]): boolean =>
      hasRoleSetAnyPermission(roles, permissions),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roles.join(",")],
  );

  return {
    role,
    roles,
    orgId: activeOrgId,
    can,
    canAny,
    isOwnerOrAbove: roles.some((r) => r === "owner" || r === "superadmin"),
    isManager: roles.includes("manager"),
    isSuperAdmin: roles.includes("superadmin"),
    isTenant: roles.includes("tenant"),
    isMaintenance: roles.includes("maintenance"),
  };
}
