import { apiGet, apiPost, apiDelete } from "./client";

export interface AgencyInvite {
  id: string;
  agencyName: string;
  managerEmail: string;
  managerFirstName: string;
  managerLastName: string;
  agencyPhone?: string;
  agencyContactEmail?: string;
  agencyCountry?: string;
  status: "pending" | "accepted" | "expired" | "revoked";
  token: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt?: string;
  organisationId?: string;
}

export interface CreateAgencyInviteRequest {
  agencyName: string;
  managerEmail: string;
  managerFirstName: string;
  managerLastName: string;
  agencyPhone?: string;
  agencyContactEmail?: string;
  agencyCountry?: string;
  agencyCurrency?: string;
  agencyAddress?: string;
}

// ── Public onboarding (no auth required) ────────────────────────────────────

export interface AgencyOnboardingDetails {
  token: string;
  agencyName: string;
  managerEmail: string;
  managerFirstName: string;
  managerLastName: string;
  agencyPhone?: string;
  agencyContactEmail?: string;
  agencyCountry?: string;
  agencyCurrency?: string;
  agencyAddress?: string;
  expiresAt: string;
}

export interface CompleteAgencyOnboardingRequest {
  agencyName: string;
  managerFirstName: string;
  managerLastName: string;
  agencyPhone?: string;
  agencyContactEmail?: string;
  agencyCountry?: string;
  agencyCurrency?: string;
  agencyAddress?: string;
}

export interface CompleteAgencyOnboardingResponse {
  message: string;
}

export const agencyInvitesApi = {
  list: () => apiGet<AgencyInvite[]>("/agency-invites"),
  create: (body: CreateAgencyInviteRequest) =>
    apiPost<AgencyInvite>("/agency-invites", body),
  resend: (id: string) => apiPost<AgencyInvite>(`/agency-invites/${id}/resend`, {}),
  revoke: (id: string) => apiDelete(`/agency-invites/${id}`),

  // Public — no session needed
  getOnboarding: (token: string) =>
    apiGet<AgencyOnboardingDetails>(`/agency-invites/onboarding/${token}`),
  completeOnboarding: (token: string, body: CompleteAgencyOnboardingRequest) =>
    apiPost<CompleteAgencyOnboardingResponse>(
      `/agency-invites/onboarding/${token}/complete`,
      body,
    ),
};
