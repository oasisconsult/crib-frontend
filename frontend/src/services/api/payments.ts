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

function mapQueryParamsToBackend(params?: QueryParams): Record<string, unknown> | undefined {
  if (!params) return undefined;

  const out: Record<string, unknown> = {};
  if (params.page != null) out.page = params.page;
  if (params.pageSize != null) out.pageSize = params.pageSize;

  // Best-effort mapping from the generic UI filter model to backend query params.
  // Backend currently supports: status, category, leaseId (+ pagination).
  for (const f of params.filters ?? []) {
    if (f.field === "state" && (f.operator === "eq" || f.operator === "in")) {
      const v = Array.isArray(f.value) ? f.value[0] : f.value;
      if (typeof v === "string") out.status = v;
    }
    if (f.field === "category" && f.operator === "eq" && typeof f.value === "string") {
      out.category = f.value;
    }
    if (f.field === "leaseId" && f.operator === "eq" && typeof f.value === "string") {
      out.leaseId = f.value;
    }
  }

  return out;
}

export const paymentsApi = {
  list: (params?: QueryParams) =>
    apiGet<PaginatedResponse<Payment>>("/payments", mapQueryParamsToBackend(params)),

  get: (id: string) =>
    apiGet<Payment>(`/payments/${id}`),

  // Flat POST /payments expects at least leaseId + rentScheduleId + amount.
  create: (data: Omit<Payment, "id" | "createdAt" | "updatedAt">) =>
    apiPost<Payment>("/payments", data),

  confirm: (id: string) =>
    apiPatch<Payment>(`/payments/${id}/confirm`, {}),

  refund: (id: string) =>
    apiPatch<Payment>(`/payments/${id}/refund`, {}),

  // Rent schedules
  listRentSchedules: (params?: QueryParams) =>
    apiGet<PaginatedResponse<RentSchedule>>(`/rent-schedules`, mapQueryParamsToBackend(params)),

  // Late fees
  listLateFees: (params?: QueryParams) =>
    apiGet<PaginatedResponse<LateFee>>("/late-fees", mapQueryParamsToBackend(params)),

  // NOTE: flat late-fees router currently only supports GET; waive/apply are lease-nested.
  // Keep these lease-nested helpers for now where used.

  // Deposits
  getDeposit: (leaseId: string) =>
    apiGet<Deposit>(`/leases/${leaseId}/deposit`),

  // Deposit return is PATCH /leases/{leaseId}/deposit/return (backend)
  returnDeposit: (leaseId: string, data: Partial<Deposit>) =>
    apiPatch<Deposit>(`/leases/${leaseId}/deposit/return`, data),

  // Ledger
  getLedger: (leaseId: string, params?: QueryParams) =>
    apiGet<LedgerEntry[]>(`/leases/${leaseId}/ledger`, params),
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
