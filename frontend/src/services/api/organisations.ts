import { apiGet, apiPatch, apiPost } from "./client";

export interface OrgFeatures {
  manualPayments?: boolean;
  rentIncreaseCapOverride?: boolean;
  [key: string]: boolean | undefined;
}

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
  features?: OrgFeatures;
}

export interface UpdateOrganisationRequest {
  name?: string;
  contactPhone?: string;
  contactEmail?: string;
}

export interface ProvisionOrganisationRequest {
  name: string;
  slug: string;
  country?: string;
  currency?: string;
}

export const organisationsApi = {
  getMe: () => apiGet<Organisation>("/organisations/me"),
  updateMe: (body: UpdateOrganisationRequest) =>
    apiPatch<Organisation>("/organisations/me", body),
  provision: (body: ProvisionOrganisationRequest) =>
    apiPost<Organisation>("/organisations/provision", body),
  updateFeatures: (features: OrgFeatures) =>
    apiPatch<Organisation>("/organisations/me/features", { features }),
};
