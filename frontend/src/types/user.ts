export type UserRole = "superadmin" | "owner" | "manager" | "landlord" | "tenant" | "maintenance" | "caretaker";

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
  /** True for agency-managed landlords — view-only access, no mutations. */
  isReadOnly?: boolean;
  // Landlord-specific
  propertyIds?: string[];
  // Tenant-specific
  tenantId?: string;
  currentLeaseId?: string;
  mobileMoneyProvider?: "mtn" | "airtel" | string | null;
  mobileMoneyNumber?: string | null;
  /**
   * Caretaker-specific metadata.
   * Populated when role === "caretaker" — scopes access to one landlord's properties.
   */
  caretakerMeta?: {
    /** ID of the owner/landlord who delegated access */
    ownerId: string;
    /** Display name of that owner (shown in the CaretakerBanner) */
    ownerName: string;
    /**
     * "full"            → same view as owner (including payments/analytics)
     * "operations_only" → operational data only; payments/analytics hidden
     */
    permissionLevel: "full" | "operations_only";
  };
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
