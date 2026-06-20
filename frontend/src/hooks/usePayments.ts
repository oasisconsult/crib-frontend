"use client";

import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryClient";
import { paymentsApi, analyticsApi } from "@/services/api/payments";
import { toast } from "@/store/useUIStore";
import type { Payment, PaymentDecision, PaymentEstimateRequest, QueryParams } from "@/types";
import type { LeaseLateFee } from "@/services/api/payments";

export function usePayments(params?: QueryParams) {
  return useQuery({
    queryKey: queryKeys.payments.list(params),
    queryFn: () => paymentsApi.list(params),
    placeholderData: keepPreviousData,
  });
}

export function usePayment(id: string) {
  return useQuery({
    queryKey: queryKeys.payments.detail(id),
    queryFn: () => paymentsApi.get(id),
    enabled: !!id,
  });
}

export function useReconcilePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => paymentsApi.confirm(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.payments.detail(id) });
      qc.invalidateQueries({ queryKey: queryKeys.payments.all() });
      toast.success("Payment confirmed");
    },
    onError: () => toast.error("Failed to confirm payment"),
  });
}

export function useRentSchedule(leaseId: string) {
  return useQuery({
    queryKey: queryKeys.payments.rentSchedule(leaseId),
    queryFn: () =>
      paymentsApi.listRentSchedules({
        filters: [{ field: "leaseId", operator: "eq", value: leaseId }],
      }),
    enabled: !!leaseId,
  });
}

export function useOverdueSchedules(params?: { page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: queryKeys.payments.overdueSchedules(params),
    queryFn: () =>
      paymentsApi.listRentSchedules({
        page: params?.page,
        pageSize: params?.pageSize ?? 50,
        filters: [{ field: "status", operator: "eq", value: "overdue" }],
      }),
    placeholderData: keepPreviousData,
  });
}

export function useLedger(leaseId: string) {
  return useQuery({
    queryKey: queryKeys.payments.ledger(leaseId),
    queryFn: () => paymentsApi.getLedger(leaseId),
    enabled: !!leaseId,
  });
}

export function useLateFees(params?: QueryParams) {
  return useQuery({
    queryKey: queryKeys.payments.lateFees(params),
    queryFn: () => paymentsApi.listLateFees(params),
  });
}

export function useLeaseLateFees(leaseId: string, page = 1, pageSize = 10) {
  return useQuery({
    queryKey: [...queryKeys.payments.leaseLateFees(leaseId), page, pageSize],
    queryFn: () => paymentsApi.listLeaseLateFees(leaseId, page, pageSize),
    enabled: !!leaseId,
    placeholderData: keepPreviousData,
  });
}

export function useDeposit(leaseId: string) {
  return useQuery({
    queryKey: queryKeys.payments.deposits(leaseId),
    queryFn: () => paymentsApi.getDeposit(leaseId),
    enabled: !!leaseId,
  });
}

export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Payment, "id" | "createdAt" | "updatedAt">) =>
      paymentsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.payments.all() });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.stats() });
      toast.success("Payment recorded");
    },
    onError: () => toast.error("Failed to record payment"),
  });
}

export function useRecordManualPayment(leaseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      amount: number;
      currency?: string;
      category?: string;
      method: string;
      paidAt?: string | null;
      reference?: string | null;
      notes?: string | null;
    }) => paymentsApi.recordManual(leaseId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.payments.all() });
      qc.invalidateQueries({ queryKey: queryKeys.payments.rentSchedule(leaseId) });
      qc.invalidateQueries({ queryKey: queryKeys.payments.ledger(leaseId) });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.stats() });
      toast.success("Payment recorded and schedules updated");
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.detail ?? "Failed to record payment"),
  });
}

export function useWaiveLateFee(leaseId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ leaseId: lid, id, reason }: { leaseId: string; id: string; reason: string }) =>
      paymentsApi.waiveLateFee(lid, id, reason),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.payments.lateFees() });
      // Invalidate all pages for this lease's late fees
      qc.invalidateQueries({ queryKey: queryKeys.payments.leaseLateFees(vars.leaseId), exact: false });
      toast.success("Late fee waived");
    },
    onError: () => toast.error("Failed to waive late fee"),
  });
}

// ── Allocation-layer hooks ────────────────────────────────────────────────────

export function useLedgerEntries(leaseId: string, page = 1, pageSize = 50) {
  return useQuery({
    queryKey: [...queryKeys.payments.ledger(leaseId), "entries", page, pageSize],
    queryFn: () => paymentsApi.getLedgerEntries(leaseId, page, pageSize),
    enabled: !!leaseId,
  });
}

export function usePaymentAllocations(leaseId: string, paymentId: string) {
  return useQuery({
    queryKey: ["payments", leaseId, paymentId, "allocations"],
    queryFn: () => paymentsApi.getPaymentAllocations(leaseId, paymentId),
    enabled: !!leaseId && !!paymentId,
  });
}

export function useTenantWallet(tenantId: string) {
  return useQuery({
    queryKey: ["wallet", tenantId],
    queryFn: () => paymentsApi.getWallet(tenantId),
    enabled: !!tenantId,
    // 404 = no wallet yet — treat as null rather than error
    retry: (count, err: any) => err?.response?.status !== 404 && count < 2,
  });
}

export function useReturnDeposit(leaseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => paymentsApi.returnDeposit(leaseId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.payments.deposits(leaseId) });
      toast.success("Deposit return processed");
    },
    onError: () => toast.error("Failed to process deposit return"),
  });
}

export function useWalletTransactions(tenantId: string, page = 1) {
  return useQuery({
    queryKey: ["wallet", tenantId, "transactions", page],
    queryFn: () => paymentsApi.getWalletTransactions(tenantId, page),
    enabled: !!tenantId,
  });
}

export function useMobileMoneyTransactions(params?: {
  status?: string;
  provider?: string;
  page?: number;
  pageSize?: number;
}) {
  return useQuery({
    queryKey: ["mobile-money", params],
    queryFn: () => paymentsApi.getMobileMoneyTransactions(params),
    refetchInterval: 30_000,  // auto-refresh every 30 s for live monitoring
  });
}

// ── Analytics ─────────────────────────────────────────────────────────────────

const queryKeys_dashboard = queryKeys.dashboard;

export function useDashboardStats() {
  return useQuery({
    queryKey: queryKeys_dashboard.stats(),
    queryFn: analyticsApi.getDashboardStats,
  });
}

export function useOccupancyData(months = 6, enabled = true) {
  return useQuery({
    queryKey: queryKeys_dashboard.occupancy(months),
    queryFn: () => analyticsApi.getOccupancy(months),
    enabled,
  });
}

export function useRevenueData(months = 6, enabled = true) {
  return useQuery({
    queryKey: queryKeys_dashboard.revenue(months),
    queryFn: () => analyticsApi.getRevenue(months),
    enabled,
  });
}

export function useCashFlowData(months = 6, enabled = true) {
  return useQuery({
    queryKey: queryKeys_dashboard.cashFlow(months),
    queryFn: () => analyticsApi.getCashFlow(months),
    enabled,
  });
}

// ── Adaptive payment hooks (v4 skill) ─────────────────────────────────────────

/**
 * Get cost estimates + recommended channel for a payment before initiating it.
 * Safe to call at any time — does not mutate state.
 */
export function usePaymentEstimate(
  leaseId: string,
  request: PaymentEstimateRequest | null,
) {
  return useQuery<PaymentDecision>({
    queryKey: ["payments", leaseId, "estimate", request],
    queryFn: () => paymentsApi.estimate(leaseId, request!),
    enabled: !!leaseId && !!request && request.amount > 0,
    staleTime: 60_000,   // estimates are stable for 1 min
    retry: false,        // don't retry — UI should degrade gracefully
  });
}

/**
 * Retry a failed payment.
 * Resets the payment to pending and increments retry_count.
 * After success, the caller should confirm the payment.
 */
export function useRetryPayment(leaseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paymentId: string) => paymentsApi.retry(leaseId, paymentId),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: queryKeys.payments.detail(updated.id) });
      qc.invalidateQueries({ queryKey: queryKeys.payments.all() });
      toast.success("Payment queued for retry");
    },
    onError: () => toast.error("Failed to retry payment"),
  });
}

/**
 * Owner / caretaker / agency manager / superadmin — reject an in-progress payment.
 *
 * Reason is required (min 1 character). The rejected payment moves to a terminal
 * state; a new payment must be created to re-attempt.
 */
export function useRejectPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      leaseId,
      paymentId,
      reason,
    }: {
      leaseId: string;
      paymentId: string;
      reason: string;
    }) => paymentsApi.reject(leaseId, paymentId, reason),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: queryKeys.payments.detail(updated.id) });
      qc.invalidateQueries({ queryKey: queryKeys.payments.all() });
      toast.success("Payment rejected");
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.detail ?? "Failed to reject payment"),
  });
}

/**
 * Tenant self-cancels their own in-progress payment.
 *
 * Only valid before the payment reaches the `reconciled` state. A reason is
 * optional but helps the property manager understand why it was cancelled.
 */
export function useCancelPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      leaseId,
      paymentId,
      reason,
    }: {
      leaseId: string;
      paymentId: string;
      reason?: string;
    }) => paymentsApi.cancel(leaseId, paymentId, reason),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: queryKeys.payments.detail(updated.id) });
      qc.invalidateQueries({ queryKey: queryKeys.payments.all() });
      toast.success("Payment cancelled");
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.detail ?? "Failed to cancel payment"),
  });
}
