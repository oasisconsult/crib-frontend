"use client";

/**
 * usePermissions — single source of truth for UI access control.
 *
 * Two permission check functions:
 *
 *   can(permission)           — legacy static check against ROLE_PERMISSIONS
 *                               (backwards compat, used throughout the codebase)
 *
 *   canDo(action, resource)   — DB-driven check against permissions fetched from
 *                               GET /api/v1/me/permissions. This is what the
 *                               Access Control admin page actually configures.
 *
 * Access rules:
 *   superadmin     → canDo() always returns true (wildcard ["*"])
 *   isReadOnly     → canDo() only allows "read" action regardless of DB config
 *   everyone else  → DB-driven from their assigned roles
 *
 * While permissions are still loading (null), canDo() falls back to the static map.
 */

import { useAppStore } from "@/store/useAppStore";
import {
  hasRoleSetPermission,
  hasRoleSetAnyPermission,
} from "@/utils/permissions";
import type { UserRole } from "@/types";

export function usePermissions() {
  const user = useAppStore((s) => s.user);
  const dbPermissions = useAppStore((s) => s.permissions);

  // Prefer full roles list; fall back to primary role for backwards compat
  const roles: UserRole[] =
    user?.roles && user.roles.length > 0
      ? user.roles
      : user?.role
        ? [user.role as UserRole]
        : ["tenant"];

  const role = roles[0]; // primary role (highest priority)

  const isSuperAdmin = roles.includes("superadmin");
  const isCaretaker  = roles.includes("caretaker");

  const hasHigherRole = roles.some((r) =>
    ["owner", "manager", "superadmin"].includes(r)
  );
  const isLandlord = roles.includes("landlord") && !hasHigherRole;
  // Agency-managed landlords have is_read_only=true on their profile.
  // Self-managing landlords (owner role) are not read-only.
  const isReadOnly = Boolean(user?.isReadOnly) || isLandlord;

  // Caretaker finance gate: when permissionLevel === "operations_only",
  // payments and analytics are hidden at the UI level (backend also enforces).
  const caretakerOperationsOnly =
    isCaretaker && user?.caretakerMeta?.permissionLevel === "operations_only";

  /**
   * DB-driven permission check (driven by the Access Control admin page).
   *
   * Usage:  canDo("delete", "property")  canDo("create", "tenant")
   *
   * - superadmin: always true
   * - isReadOnly: only "read" action allowed
   * - others: checks the DB permission set fetched on login
   * - loading: falls back to static ROLE_PERMISSIONS map
   */
  function canDo(action: string, resource: string): boolean {
    if (isSuperAdmin) return true;
    if (isReadOnly && action !== "read") return false;

    // Caretaker operations_only gate: block analytics at the UI level.
    // Payments (who paid / who hasn't) are still allowed — only financial
    // analytics/charts are hidden.  Backend independently enforces the same rule.
    if (caretakerOperationsOnly) {
      const blockedResources = ["analytics"];
      if (blockedResources.includes(resource)) return false;
    }

    if (dbPermissions === null) {
      // Permissions not yet loaded — fall back to static map
      // Use the closest matching key from ROLE_PERMISSIONS
      const staticKey = `${resource}s:${action}` as Parameters<typeof hasRoleSetPermission>[1];
      const altKey = `${resource}:${action}` as Parameters<typeof hasRoleSetPermission>[1];
      return (
        hasRoleSetPermission(roles, staticKey) ||
        hasRoleSetPermission(roles, altKey)
      );
    }

    // Wildcard — superadmin already handled above but guard for edge cases
    if (dbPermissions.includes("*")) return true;

    return dbPermissions.includes(`${resource}:${action}`);
  }

  return {
    role,
    roles,

    // ── DB-driven (Access Control page) ──────────────────────────────────────
    canDo,

    // ── Legacy static checks (backwards compat) ───────────────────────────────
    can: (permission: Parameters<typeof hasRoleSetPermission>[1]) =>
      isSuperAdmin || hasRoleSetPermission(roles, permission),
    canAny: (permissions: Parameters<typeof hasRoleSetAnyPermission>[1]) =>
      isSuperAdmin || hasRoleSetAnyPermission(roles, permissions),

    // ── Role flags ────────────────────────────────────────────────────────────
    isSuperAdmin,
    isOwnerOrAbove: roles.some((r) => r === "owner" || r === "superadmin"),
    isManager: roles.includes("manager"),
    isLandlord,
    isTenant: roles.includes("tenant"),
    isMaintenance: roles.includes("maintenance"),
    canManageOrg: roles.some((r) =>
      ["owner", "manager", "superadmin"].includes(r)
    ),

    /**
     * True for agency-managed landlords (is_read_only=true on their profile).
     * They have view-only access — no create/edit/delete operations.
     */
    isReadOnly,
    canWrite: !isReadOnly,

    // ── Caretaker flags ───────────────────────────────────────────────────────
    /**
     * True when the current user is a caretaker delegated by an owner/landlord.
     * Data is automatically scoped to their propertyIds by the backend.
     * A landlord may have multiple caretakers; each has their own account and scope.
     */
    isCaretaker,
    /**
     * True for both owners and their caretakers — used to show operational
     * nav items that apply to both (e.g. Properties, Tenants, Leases).
     */
    isOwnerOrCaretaker: roles.some(r => r === "owner" || r === "caretaker"),
    /**
     * True when the caretaker is restricted to operations only (no financials).
     */
    caretakerOperationsOnly,
    /**
     * Delegating owner info — only set when isCaretaker=true.
     */
    caretakerMeta: isCaretaker ? user?.caretakerMeta : undefined,
  };
}
