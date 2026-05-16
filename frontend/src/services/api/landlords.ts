import { apiGet, apiPost, apiDelete } from "./client";

export interface LandlordInvite {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  propertyIds: string[];
  message?: string;
  isIndependent: boolean;
  status: "pending" | "accepted" | "expired" | "revoked";
  token: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt?: string;
}

export interface CreateLandlordInviteRequest {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  propertyIds: string[];
  message?: string;
  isIndependent?: boolean;
}

// ── Public onboarding (no auth required) ────────────────────────────────────

export interface LandlordOnboardingDetails {
  token: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  message?: string;
  expiresAt: string;
  agencyName: string;
  agencyEmail?: string;
  agencyPhone?: string;
  properties: Array<{ id: string; name: string; address: string }>;
}

export interface CompleteLandlordOnboardingRequest {
  firstName: string;
  lastName: string;
  phone?: string;
}

export interface CompleteLandlordOnboardingResponse {
  message: string;
}

export interface ProfileSearchResult {
  id: string;
  displayName: string | null;
  email: string | null;
  role: string;
  organisationId: string | null;
}

export interface OrgSearchResult {
  id: string;
  name: string;
  slug: string;
  isArchived: boolean;
}

export interface MigrateToPersonalOrgResponse {
  org_id: string;
  org_name: string;
  logto_org_id: string;
  message: string;
}

export interface AssignToAgencyRequest {
  agency_org_id: string;
  property_ids?: string[];
}

export interface AssignToAgencyResponse {
  properties_transferred: number;
  agency_org_id: string;
  message: string;
}

export const landlordsApi = {
  listInvites: () => apiGet<LandlordInvite[]>("/landlords/invites"),
  createInvite: (body: CreateLandlordInviteRequest) =>
    apiPost<LandlordInvite>("/landlords/invites", body),
  revokeInvite: (id: string) => apiDelete(`/landlords/invites/${id}`),
  resendInvite: (id: string) => apiPost<LandlordInvite>(`/landlords/invites/${id}/resend`, {}),

  // Superadmin search
  searchProfiles: (q: string, role?: string) =>
    apiGet<ProfileSearchResult[]>("/admin/search/profiles", { q, ...(role ? { role } : {}) }),
  searchOrganisations: (q: string, activeOnly?: boolean) =>
    apiGet<OrgSearchResult[]>("/admin/search/organisations", { q, ...(activeOnly ? { active_only: true } : {}) }),

  // Superadmin landlord lifecycle
  adminMigrateToPersonalOrg: (profileId: string) =>
    apiPost<MigrateToPersonalOrgResponse>(`/admin/landlords/${profileId}/migrate-to-personal-org`, {}),
  adminAssignToAgency: (profileId: string, body: AssignToAgencyRequest) =>
    apiPost<AssignToAgencyResponse>(`/admin/landlords/${profileId}/assign-to-agency`, body),

  // Public — no session needed
  getOnboarding: (token: string) =>
    apiGet<LandlordOnboardingDetails>(`/landlords/onboarding/${token}`),
  completeOnboarding: (token: string, body: CompleteLandlordOnboardingRequest) =>
    apiPost<CompleteLandlordOnboardingResponse>(`/landlords/onboarding/${token}/complete`, body),
};
