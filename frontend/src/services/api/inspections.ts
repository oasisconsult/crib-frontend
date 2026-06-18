import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from "./client";
import type { Contractor, Inspection, MaintenanceIssue, PaginatedResponse, QueryParams } from "@/types";
import type { InspectorPortalOut, InspectorSubmitBody } from "@/types/inspection";
import type { InspectionEvent, MaintenanceEvent } from "@/types/states";
import { toInspectionParams, toMaintenanceParams } from "@/utils/backendParams";

export interface ChecklistItem {
  id: string;
  area: string;
  description: string;
  condition?: string | null;
  notes?: string | null;
  photoUrls?: string[];
  required?: boolean;
}

export interface InspectionPublicOut {
  id: string;
  type: string;
  state: string;
  scheduledDate: string;
  propertyName?: string;
  unitName?: string;
  overallCondition?: string;
  summary?: string;
  recommendations?: string;
  checklist: ChecklistItem[];
  checklistCount: number;
  photoUrls: string[];
  photoCount: number;
  landlordSignedAt?: string;
  landlordSignedBy?: string;
  tenantSignedAt?: string;
  signTokenExpiresAt?: string;
  reportPdfUrl?: string;
}

export const inspectionsApi = {
  list: (params?: QueryParams & { unitId?: string; leaseId?: string }) =>
    apiGet<PaginatedResponse<Inspection>>("/inspections", toInspectionParams(params)),

  get: (id: string) =>
    apiGet<Inspection>(`/inspections/${id}`),

  create: (data: Omit<Inspection, "id" | "createdAt" | "updatedAt" | "state">) =>
    apiPost<Inspection>("/inspections", data),

  update: (id: string, data: Partial<Inspection>) =>
    apiPut<Inspection>(`/inspections/${id}`, data),

  transition: (id: string, event: InspectionEvent, payload?: object) =>
    apiPost<Inspection>(`/inspections/${id}/transition`, { event, ...payload }),

  addPhotos: (id: string, urls: string[]) =>
    apiPatch<Inspection>(`/inspections/${id}/photos`, { urls }),

  generateReport: (id: string) =>
    apiPost<Inspection>(`/inspections/${id}/report`, {}),

  reportDownloadUrl: (id: string) => `/api/v1/inspections/${id}/report/download`,

  signLandlord: (id: string, signedBy: string) =>
    apiPost<Inspection>(`/inspections/${id}/sign/landlord`, { signedBy }),

  sendForSigning: (id: string) =>
    apiPost<Inspection>(`/inspections/${id}/send-for-signing`, {}),

  getPublicByToken: (token: string) =>
    apiGet<InspectionPublicOut>(`/inspections/sign/${token}`),

  tenantSign: (token: string, fullName: string) =>
    apiPost<InspectionPublicOut>(`/inspections/sign/${token}`, { fullName }),

  // Inspector portal (external contractor, no login)
  assignInspector: (id: string, contractorId: string, expiresInDays?: number) =>
    apiPost<Inspection>(`/inspections/${id}/assign-inspector`, { contractorId, expiresInDays: expiresInDays ?? 7 }),

  getInspectorPortal: (token: string) =>
    apiGet<InspectorPortalOut>(`/inspections/portal/${token}`),

  inspectorSubmit: (token: string, body: InspectorSubmitBody) =>
    apiPost<InspectorPortalOut>(`/inspections/portal/${token}`, body),

  // Maintenance
  listMaintenance: (params?: QueryParams) =>
    apiGet<PaginatedResponse<MaintenanceIssue>>("/maintenance", toMaintenanceParams(params)),

  getMaintenance: (id: string) =>
    apiGet<MaintenanceIssue>(`/maintenance/${id}`),

  createMaintenance: (data: Omit<MaintenanceIssue, "id" | "createdAt" | "updatedAt" | "state">) =>
    apiPost<MaintenanceIssue>("/maintenance", data),

  updateMaintenance: (id: string, data: Partial<MaintenanceIssue>) =>
    apiPut<MaintenanceIssue>(`/maintenance/${id}`, data),

  transitionMaintenance: (id: string, event: MaintenanceEvent, payload?: object) =>
    apiPost<MaintenanceIssue>(`/maintenance/${id}/transition`, { event, ...payload }),

  // Contractor directory
  listContractors: (params?: { specialty?: string; isActive?: boolean; search?: string }) =>
    apiGet<PaginatedResponse<Contractor>>("/contractors", params),

  getContractor: (id: string) =>
    apiGet<Contractor>(`/contractors/${id}`),

  createContractor: (data: Omit<Contractor, "id" | "organisationId" | "isActive" | "isInspector" | "createdAt" | "updatedAt"> & { isInspector?: boolean }) =>
    apiPost<Contractor>("/contractors", data),

  updateContractor: (id: string, data: Partial<Omit<Contractor, "id" | "organisationId" | "createdAt" | "updatedAt">>) =>
    apiPut<Contractor>(`/contractors/${id}`, data),

  deactivateContractor: (id: string) =>
    apiDelete(`/contractors/${id}`),
};
