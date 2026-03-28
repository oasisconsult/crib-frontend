export type UserRole = "superadmin" | "landlord" | "manager" | "tenant";

export type UserStatus = "active" | "inactive" | "suspended";

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: UserRole;
  status: UserStatus;
  phone?: string;
  timezone: string;
  locale: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  // Landlord-specific
  propertyIds?: string[];
  // Tenant-specific
  tenantId?: string;
  currentLeaseId?: string;
}

export interface AuthSession {
  user: User;
  accessToken: string;
  expiresAt: number;
}
