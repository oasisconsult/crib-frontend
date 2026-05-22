"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BillingCurrency, BillingCycle,
  SubmitPaymentPayload,
  adminBillingApi, subscriptionsApi,
} from "@/services/api/subscriptions";

const KEYS = {
  plans:       ["subscription", "plans"] as const,
  current:     ["subscription", "current"] as const,
  usage:       ["subscription", "usage"] as const,
  history:     ["subscription", "history"] as const,
  invoices:    ["subscription", "invoices"] as const,
  settings:    ["billing", "settings"] as const,
  adminPlans:  ["admin", "billing", "plans"] as const,
  adminSubs:   ["admin", "billing", "subscriptions"] as const,
  adminQueue:  ["admin", "billing", "pending-payments"] as const,
  adminStats:  ["admin", "billing", "analytics"] as const,
};

// ── User-facing hooks ──────────────────────────────────────────────────────

export function usePlans() {
  return useQuery({ queryKey: KEYS.plans, queryFn: subscriptionsApi.getPlans, staleTime: 5 * 60_000 });
}

export function useCurrentSubscription() {
  return useQuery({ queryKey: KEYS.current, queryFn: subscriptionsApi.getCurrent, staleTime: 60_000 });
}

export function useSubscriptionUsage() {
  return useQuery({ queryKey: KEYS.usage, queryFn: subscriptionsApi.getUsage, staleTime: 60_000 });
}

export function usePaymentHistory(limit = 20, offset = 0) {
  return useQuery({
    queryKey: [...KEYS.history, limit, offset],
    queryFn: () => subscriptionsApi.getPaymentHistory(limit, offset),
  });
}

export function useInvoices(limit = 20, offset = 0) {
  return useQuery({
    queryKey: [...KEYS.invoices, limit, offset],
    queryFn: () => subscriptionsApi.getInvoices(limit, offset),
  });
}

export function useBillingSettings() {
  return useQuery({ queryKey: KEYS.settings, queryFn: subscriptionsApi.getBillingSettings, staleTime: 10 * 60_000 });
}

export function useSelectPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, billingCycle, currency }: { planId: string; billingCycle: BillingCycle; currency: BillingCurrency }) =>
      subscriptionsApi.selectPlan(planId, billingCycle, currency),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.current });
      qc.invalidateQueries({ queryKey: KEYS.usage });
    },
  });
}

export function useSubmitPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SubmitPaymentPayload) => subscriptionsApi.submitPayment(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.current });
      qc.invalidateQueries({ queryKey: KEYS.history });
    },
  });
}

export function useCancelSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reason?: string) => subscriptionsApi.cancel(reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.current }),
  });
}

// ── Admin hooks ────────────────────────────────────────────────────────────

export function useAdminPlans() {
  return useQuery({ queryKey: KEYS.adminPlans, queryFn: adminBillingApi.getPlans });
}

export function useAdminUpdatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, updates }: { planId: string; updates: Record<string, unknown> }) =>
      adminBillingApi.updatePlan(planId, updates as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.adminPlans });
      qc.invalidateQueries({ queryKey: KEYS.plans });
    },
  });
}

export function useAdminPendingPayments(limit = 50, offset = 0) {
  return useQuery({
    queryKey: [...KEYS.adminQueue, limit, offset],
    queryFn: () => adminBillingApi.getPendingPayments(limit, offset),
    refetchInterval: 30_000,
  });
}

export function useAdminVerifyPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ paymentId, notes }: { paymentId: string; notes?: string }) =>
      adminBillingApi.verifyPayment(paymentId, notes),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.adminQueue }),
  });
}

export function useAdminRejectPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ paymentId, reason }: { paymentId: string; reason: string }) =>
      adminBillingApi.rejectPayment(paymentId, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.adminQueue }),
  });
}

export function useAdminBillingSettings() {
  return useQuery({ queryKey: KEYS.settings, queryFn: adminBillingApi.getBillingSettings });
}

export function useAdminUpdateBillingSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (updates: Record<string, unknown>) => adminBillingApi.updateBillingSettings(updates as any),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.settings }),
  });
}

export function useAdminAnalytics() {
  return useQuery({ queryKey: KEYS.adminStats, queryFn: adminBillingApi.getAnalytics, staleTime: 2 * 60_000 });
}

export function useAdminAnalyticsCharts() {
  return useQuery({
    queryKey: [...KEYS.adminStats, "charts"],
    queryFn: adminBillingApi.getAnalyticsCharts,
    staleTime: 5 * 60_000,
  });
}

export function useAdminSubscriptions(params?: {
  status?: string; planSlug?: string; search?: string; limit?: number; offset?: number;
}) {
  return useQuery({
    queryKey: [...KEYS.adminSubs, params],
    queryFn: () => adminBillingApi.getSubscriptions(params),
    staleTime: 30_000,
  });
}

export function useAdminSuspendSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ subscriptionId, reason }: { subscriptionId: string; reason: string }) =>
      adminBillingApi.suspendSubscription(subscriptionId, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.adminSubs }),
  });
}

export function useAdminExtendSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ subscriptionId, days, reason }: { subscriptionId: string; days: number; reason?: string }) =>
      adminBillingApi.extendSubscription(subscriptionId, days, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.adminSubs }),
  });
}
