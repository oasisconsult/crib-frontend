import { apiGet, apiPost, apiPut } from "./client";
import type { PaginatedResponse } from "@/types";

export interface EfrisConfig {
  id: string;
  organisationId: string;
  environment: "mock" | "uat" | "prod";
  apiUrl: string;
  tin: string;
  deviceNo: string;
  username: string;
  passwordSet: boolean;
  taxpayerId?: string | null;
  qrCodeUrl?: string | null;
  isActive: boolean;
  updatedById?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EfrisConfigUpsert {
  environment: "mock" | "uat" | "prod";
  apiUrl: string;
  tin: string;
  deviceNo: string;
  username: string;
  password?: string | null;
  isActive: boolean;
}

export interface EfrisTestResult {
  success: boolean;
  message: string;
  taxpayerId?: string | null;
  legalName?: string | null;
  environment?: string | null;
}

export interface EfrisAuditLogEntry {
  id: string;
  paymentId?: string | null;
  action: string;
  statusCode?: number | null;
  efrisStatus: string;
  failureReason?: string | null;
  durationMs?: number | null;
  createdAt: string;
}

export interface EfrisFailedPayment {
  id: string;
  leaseId: string;
  amount: number;
  currency: string;
  category: string;
  method: string;
  paidAt?: string | null;
  efrisStatus?: string | null;
  efrisFailureReason?: string | null;
  efrisRetryCount: number;
  createdAt: string;
}

export interface EfrisCompliancePayment {
  id: string;
  leaseId: string;
  reference?: string | null;
  tenantName?: string | null;
  amount: number;
  currency: string;
  category: string;
  paidAt?: string | null;
  efrisStatus?: string | null;
  efrisReceiptNumber?: string | null;
  efrisReceiptDate?: string | null;
  efrisFailureReason?: string | null;
  efrisRetryCount: number;
  createdAt: string;
}

export const efrisApi = {
  getConfig: (orgId: string) =>
    apiGet<EfrisConfig | null>(`/organisations/${orgId}/efris/config`),

  upsertConfig: (orgId: string, data: EfrisConfigUpsert) =>
    apiPut<EfrisConfig>(`/organisations/${orgId}/efris/config`, data),

  testConnection: (orgId: string) =>
    apiPost<EfrisTestResult>(`/organisations/${orgId}/efris/config/test`, {}),

  getAuditLog: (orgId: string, page = 1, pageSize = 20) =>
    apiGet<PaginatedResponse<EfrisAuditLogEntry>>(
      `/organisations/${orgId}/efris/compliance`,
      { page, pageSize },
    ),

  getFailedPayments: (orgId: string, page = 1, pageSize = 20) =>
    apiGet<PaginatedResponse<EfrisFailedPayment>>(
      `/organisations/${orgId}/efris/failed`,
      { page, pageSize },
    ),

  retryPayment: (leaseId: string, paymentId: string) =>
    apiPost<{ queued: boolean; paymentId: string }>(
      `/leases/${leaseId}/payments/${paymentId}/efris/retry`,
      {},
    ),

  getCompliancePayments: (orgId: string, status?: string, page = 1, pageSize = 20) =>
    apiGet<PaginatedResponse<EfrisCompliancePayment>>(
      `/organisations/${orgId}/efris/payments`,
      { ...(status ? { efrisStatus: status } : {}), page, pageSize },
    ),
};
