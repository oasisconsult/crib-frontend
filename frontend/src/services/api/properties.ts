import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from "./client";
import type { Property, Unit, PaginatedResponse, QueryParams, PropertyRules } from "@/types";

export interface ResolvedGeocode {
  geocode: string | null;
  fullAddress?: string;
  landmarkDescription?: string;
  accessInstructions?: string;
  deliveryNotes?: string;
  navUrl?: string;
  coordinates?: { latitude: number; longitude: number } | null;
}

export const propertiesApi = {
  list: (params?: QueryParams) =>
    apiGet<PaginatedResponse<Property>>("/properties", params),

  get: (id: string) =>
    apiGet<Property>(`/properties/${id}`),

  create: (data: Omit<Property, "id" | "createdAt" | "updatedAt">) =>
    apiPost<Property>("/properties", data),

  update: (id: string, data: Partial<Property>) =>
    apiPut<Property>(`/properties/${id}`, data),

  delete: (id: string) =>
    apiDelete<void>(`/properties/${id}`),

  restore: (id: string) =>
    apiPost<Property>(`/properties/${id}/restore`, {}),

  updateRules: (id: string, rules: PropertyRules) =>
    apiPatch<Property>(`/properties/${id}/rules`, rules),

  // Units
  listUnits: (propertyId: string, params?: QueryParams) =>
    apiGet<PaginatedResponse<Unit>>(`/properties/${propertyId}/units`, params),

  getUnit: (propertyId: string, unitId: string) =>
    apiGet<Unit>(`/properties/${propertyId}/units/${unitId}`),

  createUnit: (propertyId: string, data: Omit<Unit, "id" | "createdAt" | "updatedAt">) =>
    apiPost<Unit>(`/properties/${propertyId}/units`, data),

  updateUnit: (propertyId: string, unitId: string, data: Partial<Unit>) =>
    apiPut<Unit>(`/properties/${propertyId}/units/${unitId}`, data),

  deleteUnit: (propertyId: string, unitId: string) =>
    apiDelete<void>(`/properties/${propertyId}/units/${unitId}`),

  restoreUnit: (propertyId: string, unitId: string) =>
    apiPost<Unit>(`/properties/${propertyId}/units/${unitId}/restore`, {}),

  bulkUpdateUnits: (propertyId: string, unitIds: string[], data: Partial<Unit>) =>
    apiPatch<Unit[]>(`/properties/${propertyId}/units/bulk`, { unitIds, ...data }),

  updateUnitRules: (propertyId: string, unitId: string, rules: PropertyRules | null) =>
    apiPatch<Unit>(`/properties/${propertyId}/units/${unitId}/rules`, { rules }),

  bulkCreateUnits: (propertyId: string, units: Omit<Unit, "id" | "propertyId" | "createdAt" | "updatedAt">[]) =>
    apiPost<Unit[]>(`/properties/${propertyId}/units/batch`, { units }),

  // GeoBox geocode resolution
  getGeocode: (propertyId: string) =>
    apiGet<ResolvedGeocode>(`/properties/${propertyId}/geocode`),
};
