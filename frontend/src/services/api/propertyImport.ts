import { apiClient } from "./client";

async function apiPostForm<T>(url: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await apiClient.post<T>(url, form, {
    headers: { "Content-Type": undefined },
  });
  return data;
}

export interface ImportError {
  row: number;
  column: string;
  message: string;
}

export interface ImportWarning {
  propertyName: string;
  message: string;
}

export interface UnitPreview {
  name: string;
  type: string;
  bedrooms: number;
  bathrooms: number;
  monthlyRent: number;
  currency: string;
  status: string;
}

export interface PropertyPreview {
  name: string;
  type: string;
  address: string;
  unitCount: number;
  units: UnitPreview[];
}

export interface ImportPreviewResponse {
  properties: PropertyPreview[];
  totalProperties: number;
  totalUnits: number;
  errors: ImportError[];
  warnings: ImportWarning[];
  isValid: boolean;
}

export interface ImportResultResponse {
  importedProperties: number;
  importedUnits: number;
  skippedProperties: number;
  warnings: ImportWarning[];
}

const BASE = "/properties/import";

export const propertyImportApi = {
  templateUrl: () => `${BASE}/template`,

  preview: (file: File) => apiPostForm<ImportPreviewResponse>(`${BASE}/preview`, file),
  commit: (file: File) => apiPostForm<ImportResultResponse>(`${BASE}/commit`, file),
};
