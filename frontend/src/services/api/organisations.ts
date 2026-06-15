import { apiGet, apiPatch, apiPost } from "./client";

export interface OrgFeatures {
  manualPayments?: boolean;
  rentIncreaseCapOverride?: boolean;
  [key: string]: boolean | undefined;
}

export type UnitNamingScheme = "numeric" | "alpha" | "alpha-numeric";

export interface UnitNamingConfig {
  scheme: UnitNamingScheme;
  startNumber?: number;
  startLetter?: string;
  numbersPerLetter?: number;
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
  unitNaming?: UnitNamingConfig;
}

export interface UpdateOrganisationRequest {
  name?: string;
  contactPhone?: string;
  contactEmail?: string;
  unitNaming?: UnitNamingConfig;
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
