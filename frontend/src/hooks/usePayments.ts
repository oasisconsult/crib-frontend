"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryClient";
import { paymentsApi, analyticsApi } from "@/services/api/payments";
import { toast } from "@/store/useUIStore";
import type { Payment, PaymentDecision, PaymentEstimateRequest, QueryParams } from "@/types";

export function usePayments(params?: QueryParams) {
  return useQuery({
    queryKey: queryKeys.payments.list(params),
    queryFn: () => paymentsApi.list(params),
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

export function useWaiveLateFee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ leaseId, id, reason }: { leaseId: string; id: string; reason: string }) =>
      paymentsApi.waiveLateFee(leaseId, id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.payments.lateFees() });
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

export function useOccupancyData(months = 6) {
  return useQuery({
    queryKey: queryKeys_dashboard.occupancy(months),
    queryFn: () => analyticsApi.getOccupancy(months),
  });
}

export function useRevenueData(months = 6) {
  return useQuery({
    queryKey: queryKeys_dashboard.revenue(months),
    queryFn: () => analyticsApi.getRevenue(months),
  });
}

export function useCashFlowData(months = 6) {
  return useQuery({
    queryKey: queryKeys_dashboard.cashFlow(months),
    queryFn: () => analyticsApi.getCashFlow(months),
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
