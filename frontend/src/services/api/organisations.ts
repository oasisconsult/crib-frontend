import { apiGet, apiPatch, apiPost } from "./client";

export interface Organisation {
  id: string;
  logtoOrgId: string;
  name: string;
  slug: string;
  plan: string;
  currency: string;
  country?: string;
  contactPhone?: string;
  contactEmail?: string;
}

export interface UpdateOrganisationRequest {
  name?: string;
  contactPhone?: string;
  contactEmail?: string;
}

export const organisationsApi = {
  getMe: () => apiGet<Organisation>("/organisations/me"),
  updateMe: (body: UpdateOrganisationRequest) =>
    apiPatch<Organisation>("/organisations/me", body),
};
