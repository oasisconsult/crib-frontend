"use client";

import type { ReactNode } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import type { UserRole } from "@/types";

interface PermissionGateProps {
  role?: UserRole | UserRole[];
  fallback?: ReactNode;
  children: ReactNode;
}

export function PermissionGate({ role, fallback = null, children }: PermissionGateProps) {
  const { role: userRole } = usePermissions();

  if (!role) return <>{children}</>;

  const allowedRoles = Array.isArray(role) ? role : [role];
  const hasAccess = allowedRoles.includes(userRole);

  return hasAccess ? <>{children}</> : <>{fallback}</>;
}
