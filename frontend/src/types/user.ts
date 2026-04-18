export type UserRole = "superadmin" | "owner" | "manager" | "tenant" | "maintenance";

export type UserStatus = "active" | "inactive" | "suspended";

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  /** Primary (highest-priority) role — kept for backwards compat. */
  role: UserRole;
  /** Full list of roles the user holds. Use this for permission checks. */
  roles: UserRole[];
  status: UserStatus;
  phone?: string;
  timezone: string;
  locale: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  /** Logto subject identifier — used as fallback for legacy message sender_id matching. */
  logtoSub?: string;
  // Landlord-specific
  propertyIds?: string[];
  // Tenant-specific
  tenantId?: string;
  currentLeaseId?: string;
}

/** True if the user holds any of the given roles. */
export function hasRole(user: User | null | undefined, ...roles: UserRole[]): boolean {
  if (!user) return false;
  return roles.some((r) => user.roles.includes(r));
}

/** True if the user is an org-level admin (owner or manager or superadmin). */
export function isOrgAdmin(user: User | null | undefined): boolean {
  return hasRole(user, "superadmin", "owner", "manager");
}

export interface AuthSession {
  user: User;
  accessToken: string;
  expiresAt: number;
}
