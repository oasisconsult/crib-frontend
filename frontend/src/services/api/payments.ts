import { apiGet, apiPost, apiPut, apiPatch } from "./client";
import type {
  Payment,
  RentSchedule,
  LateFee,
  Deposit,
  LedgerEntry,
  PaginatedResponse,
  QueryParams,
  DashboardStats,
  OccupancyDataPoint,
  RevenueDataPoint,
  CashFlowDataPoint,
} from "@/types";

export const paymentsApi = {
  list: (params?: QueryParams) =>
    apiGet<PaginatedResponse<Payment>>("/payments", params),

  get: (id: string) =>
    apiGet<Payment>(`/payments/${id}`),

  create: (data: Omit<Payment, "id" | "createdAt" | "updatedAt" | "state">) =>
    apiPost<Payment>("/payments", data),

  reconcile: (id: string) =>
    apiPatch<Payment>(`/payments/${id}/reconcile`, {}),

  // Rent schedules
  getRentSchedule: (leaseId: string) =>
    apiGet<RentSchedule[]>(`/rent-schedules?leaseId=${leaseId}`),

  // Late fees
  listLateFees: (params?: QueryParams) =>
    apiGet<PaginatedResponse<LateFee>>("/late-fees", params),

  waiveLateFee: (id: string, reason: string) =>
    apiPatch<LateFee>(`/late-fees/${id}/waive`, { reason }),

  // Deposits
  getDeposit: (leaseId: string) =>
    apiGet<Deposit>(`/leases/${leaseId}/deposit`),

  updateDeposit: (leaseId: string, data: Partial<Deposit>) =>
    apiPut<Deposit>(`/leases/${leaseId}/deposit`, data),

  // Ledger
  getLedger: (tenantId: string, params?: QueryParams) =>
    apiGet<LedgerEntry[]>(`/tenants/${tenantId}/ledger`, params),

  // Export
  exportPayments: (params?: QueryParams, format: "csv" | "pdf" = "csv") =>
    apiGet<Blob>(`/payments/export?format=${format}`, params),
};

export const analyticsApi = {
  getDashboardStats: () =>
    apiGet<DashboardStats>("/analytics/dashboard"),

  getOccupancy: (months = 12) =>
    apiGet<OccupancyDataPoint[]>(`/analytics/occupancy?months=${months}`),

  getRevenue: (months = 12) =>
    apiGet<RevenueDataPoint[]>(`/analytics/revenue?months=${months}`),

  getCashFlow: (months = 12) =>
    apiGet<CashFlowDataPoint[]>(`/analytics/cashflow?months=${months}`),
};
