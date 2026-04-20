import { apiPost } from "./client";

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

  preview: (file: File): Promise<ImportPreviewResponse> => {
    const form = new FormData();
    form.append("file", file);
    return apiPost<ImportPreviewResponse>(`${BASE}/preview`, form);
  },

  commit: (file: File): Promise<ImportResultResponse> => {
    const form = new FormData();
    form.append("file", file);
    return apiPost<ImportResultResponse>(`${BASE}/commit`, form);
  },
};
