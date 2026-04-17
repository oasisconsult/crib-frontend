import { apiGet, apiPost, apiPatch } from "./client";
import type {
  Payment,
  PaymentDecision,
  PaymentEstimateRequest,
  RentSchedule,
  LateFee,
  Deposit,
  LedgerEntry,
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
import { toPaymentParams } from "@/utils/backendParams";

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
    const raw = await apiGet<PaginatedResponse<Record<string, unknown>>>("/payments", toPaymentParams(params));
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

  // Retry a failed payment — resets to pending, increments retry_count
  retry: async (leaseId: string, paymentId: string) => {
    const raw = await apiPost<Record<string, unknown>>(
      `/leases/${leaseId}/payments/${paymentId}/retry`,
      {}
    );
    return mapPayment(raw);
  },

  // Cost estimate + adaptive channel recommendation (does not mutate state)
  estimate: (leaseId: string, data: PaymentEstimateRequest) =>
    apiPost<PaymentDecision>(`/leases/${leaseId}/payments/estimate`, data),

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

  // Waive a late fee — PATCH /leases/{leaseId}/late-fees/{feeId}/waive
  waiveLateFee: (leaseId: string, feeId: string, reason: string) =>
    apiPatch(`/leases/${leaseId}/late-fees/${feeId}/waive`, { reason }),

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
