import { apiGet, apiPost, apiPut, apiPatch } from "./client";
import type { Inspection, MaintenanceIssue, PaginatedResponse, QueryParams } from "@/types";
import type { InspectionEvent, MaintenanceEvent } from "@/types/states";
import { toInspectionParams, toMaintenanceParams } from "@/utils/backendParams";

export const inspectionsApi = {
  list: (params?: QueryParams) =>
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
};
