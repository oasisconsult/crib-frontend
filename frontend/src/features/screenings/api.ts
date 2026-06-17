import { apiGet, apiPost, apiPatch } from "@/services/api/client";
import type { TenantScreening, ChecklistItem } from "./types";

export interface CreateScreeningBody {
  applicantName: string;
  applicantPhone?: string;
  applicantEmail?: string;
  unitId?: string;
  notes?: string;
}

export interface UpdateScreeningBody {
  applicantName?: string;
  applicantPhone?: string;
  applicantEmail?: string;
  notes?: string;
  checklist?: Array<{ key: string; checked: boolean; notes?: string | null }>;
}

export interface DecideBody {
  decision: "approved" | "rejected";
  notes?: string;
}

export const screeningsApi = {
  list: (unitId?: string, status?: string, page = 1) =>
    apiGet<{ data: TenantScreening[]; total: number; page: number }>(
      "/screenings",
      { ...(unitId && { unit_id: unitId }), ...(status && { status }), page, page_size: 20 },
    ),

  get: (id: string) => apiGet<TenantScreening>(`/screenings/${id}`),

  create: (body: CreateScreeningBody) =>
    apiPost<TenantScreening>("/screenings", body),

  update: (id: string, body: UpdateScreeningBody) =>
    apiPatch<TenantScreening>(`/screenings/${id}`, body),

  decide: (id: string, body: DecideBody) =>
    apiPost<TenantScreening>(`/screenings/${id}/decide`, body),
};
