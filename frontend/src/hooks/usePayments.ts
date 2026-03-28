"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryClient";
import { paymentsApi, analyticsApi } from "@/services/api/payments";
import { toast } from "@/store/useUIStore";
import type { Payment, QueryParams } from "@/types";

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
    mutationFn: (id: string) => paymentsApi.reconcile(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.payments.detail(id) });
      qc.invalidateQueries({ queryKey: queryKeys.payments.all() });
      toast.success("Payment reconciled");
    },
    onError: () => toast.error("Failed to reconcile payment"),
  });
}

export function useRentSchedule(leaseId: string) {
  return useQuery({
    queryKey: queryKeys.payments.rentSchedule(leaseId),
    queryFn: () => paymentsApi.getRentSchedule(leaseId),
    enabled: !!leaseId,
  });
}

export function useLedger(tenantId: string) {
  return useQuery({
    queryKey: queryKeys.payments.ledger(tenantId),
    queryFn: () => paymentsApi.getLedger(tenantId),
    enabled: !!tenantId,
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
    mutationFn: (data: Omit<Payment, "id" | "createdAt" | "updatedAt" | "state">) =>
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
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      paymentsApi.waiveLateFee(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.payments.lateFees() });
      toast.success("Late fee waived");
    },
    onError: () => toast.error("Failed to waive late fee"),
  });
}

// Analytics
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
