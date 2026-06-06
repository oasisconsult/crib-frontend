import { apiGet, apiPatch } from "./client";

export interface AdminProfile {
  id: string;
  displayName: string | null;
  email: string | null;
  role: string;
  isActive: boolean;
  organisationId: string | null;
  createdAt: string;
}

export interface AdminProfilePage {
  data: AdminProfile[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
}

export interface PlatformStats {
  totalProfiles: number;
  activeProfiles: number;
  pendingProfiles: number;
  inactiveProfiles: number;
  totalOrganisations: number;
  activeOrganisations: number;
}

export interface HealthStatus {
  status: string;
  checks: Record<string, string>;
}

export const adminApi = {
  listProfiles: (params?: { role?: string; page?: number; pageSize?: number }) =>
    apiGet<AdminProfilePage>("/admin/profiles", params as Record<string, unknown>),

  platformStats: () =>
    apiGet<PlatformStats>("/admin/platform-stats"),

  healthReady: () =>
    apiGet<HealthStatus>("/health/ready").catch(() => ({
      status: "degraded",
      checks: { database: "error", redis: "error" },
    })),

  getOrgFeatures: (orgId: string) =>
    apiGet<{ organisationId: string; features: Record<string, boolean> }>(
      `/admin/organisations/${orgId}/features`,
    ),

  updateOrgFeatures: (orgId: string, features: Record<string, boolean>) =>
    apiPatch<{ organisationId: string; features: Record<string, boolean> }>(
      `/admin/organisations/${orgId}/features`,
      { features },
    ),
};
