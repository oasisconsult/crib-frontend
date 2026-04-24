import { apiClient } from "./client";

async function apiPostForm<T>(url: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await apiClient.post<T>(url, form, {
    headers: { "Content-Type": undefined },
  });
  return data;
}

export interface TenantImportError {
  row: number;
  column: string;
  message: string;
}

export interface TenantImportWarning {
  row: number | null;
  email: string | null;
  message: string;
}

export interface TenantPreview {
  rowNum: number;
  firstName: string;
  lastName: string;
  email: string;
  propertyName: string | null;
  unitName: string | null;
  monthlyRent: number | null;
  leaseStartDate: string | null;
  mode: "with_lease" | "profile_only";
}

export interface TenantImportPreviewResponse {
  tenants: TenantPreview[];
  totalTenants: number;
  withLease: number;
  profileOnly: number;
  errors: TenantImportError[];
  warnings: TenantImportWarning[];
  isValid: boolean;
}

export interface TenantImportResultResponse {
  importedTenants: number;
  withLease: number;
  profileOnly: number;
  skippedTenants: number;
  logtoAccountsCreated: number;
  logtoAccountsFailed: number;
  warnings: TenantImportWarning[];
}

const BASE = "/tenants/import";

export const tenantImportApi = {
  templateUrl: () => `${BASE}/template`,
  preview: (file: File) => apiPostForm<TenantImportPreviewResponse>(`${BASE}/preview`, file),
  commit:  (file: File) => apiPostForm<TenantImportResultResponse>(`${BASE}/commit`, file),
};
