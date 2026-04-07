import { apiGet, apiPost, apiPut, apiPatch } from "./client";
import type {
  Payment,
  RentSchedule,
  LateFee,
  Deposit,
  LedgerEntry,
  LedgerEntryV2,
  LedgerPage,
  PaymentAllocation,
  TenantWallet,
  WalletTransactionPage,
  MobileMoneyPage,
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

// Backend PaymentOut uses `status`; frontend Payment type uses `state`.
function mapPayment(raw: Record<string, unknown>): Payment {
  return {
    ...(raw as unknown as Payment),
    state: ((raw.status ?? raw.state) as Payment["state"]),
  };
}

function mapPaymentList(raw: PaginatedResponse<Record<string, unknown>>): PaginatedResponse<Payment> {
  return { ...raw, data: raw.data.map(mapPayment) };
}

export const paymentsApi = {
  list: async (params?: QueryParams) => {
    const raw = await apiGet<PaginatedResponse<Record<string, unknown>>>("/payments", mapQueryParamsToBackend(params));
    return mapPaymentList(raw);
  },

  get: async (id: string) => {
    const raw = await apiGet<Record<string, unknown>>(`/payments/${id}`);
    return mapPayment(raw);
  },

  // Flat POST /payments expects at least leaseId + rentScheduleId + amount.
  create: (data: Omit<Payment, "id" | "createdAt" | "updatedAt">) =>
    apiPost<Payment>("/payments", data),

  confirm: async (id: string) => {
    const raw = await apiPatch<Record<string, unknown>>(`/payments/${id}/confirm`, {});
    return mapPayment(raw);
  },

  refund: async (id: string) => {
    const raw = await apiPatch<Record<string, unknown>>(`/payments/${id}/refund`, {});
    return mapPayment(raw);
  },

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

  // Ledger (summary)
  getLedger: (leaseId: string, params?: QueryParams) =>
    apiGet<LedgerEntry[]>(`/leases/${leaseId}/ledger`, params),

  // Ledger entries (immutable audit trail — new allocation layer)
  getLedgerEntries: (leaseId: string, page = 1, pageSize = 50) =>
    apiGet<LedgerPage>(`/leases/${leaseId}/ledger/entries`, { page, pageSize }),

  // Payment allocations — which schedules a payment touched
  getPaymentAllocations: (leaseId: string, paymentId: string) =>
    apiGet<PaymentAllocation[]>(`/leases/${leaseId}/payments/${paymentId}/allocations`),

  // Tenant wallet
  getWallet: (tenantId: string) =>
    apiGet<TenantWallet>(`/tenants/${tenantId}/wallet`),

  getWalletTransactions: (tenantId: string, page = 1, pageSize = 20) =>
    apiGet<WalletTransactionPage>(`/tenants/${tenantId}/wallet/transactions`, { page, pageSize }),

  // Mobile money reconciliation
  getMobileMoneyTransactions: (params?: {
    status?: string;
    provider?: string;
    page?: number;
    pageSize?: number;
  }) =>
    apiGet<MobileMoneyPage>("/mobile-money", params),
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
