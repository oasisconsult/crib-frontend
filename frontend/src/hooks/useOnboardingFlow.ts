"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { onboardingFlowApi } from "@/services/api/onboarding";
import type { OnboardingPaymentItem } from "@/types/onboarding";

// ── Query keys ─────────────────────────────────────────────────────────────────

export const onboardingKeys = {
  flow: (token: string) => ["onboarding", "flow", token] as const,
};

// ── Queries ────────────────────────────────────────────────────────────────────

/** Fetch full onboarding state. Used on page load to resume from correct step. */
export function useOnboardingFlowStatus(token: string) {
  return useQuery({
    queryKey: onboardingKeys.flow(token),
    queryFn: () => onboardingFlowApi.getFlowStatus(token),
    staleTime: 10_000,
    retry: false,
    // Auto-poll while the tenant is approved but waiting for the landlord to
    // link a lease. Once the lease appears the page transitions automatically
    // and polling stops.
    refetchInterval: (query) => {
      const data = query.state.data as { tenant?: { onboardingState?: string }; invite?: { leaseId?: string } } | undefined;
      if (data?.tenant?.onboardingState === "approved" && !data?.invite?.leaseId) {
        return 15_000; // 15 s — fast enough to feel responsive
      }
      return false;
    },
  });
}

// ── Mutations ──────────────────────────────────────────────────────────────────

/** Generate (or return cached) agreement preview snapshot. */
export function usePreviewAgreement(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => onboardingFlowApi.previewAgreement(token),
    onSuccess: () => qc.invalidateQueries({ queryKey: onboardingKeys.flow(token) }),
  });
}

/** Record explicit terms acceptance. */
export function useAcceptTerms(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (accepted: boolean) => onboardingFlowApi.acceptTerms(token, accepted),
    onSuccess: () => qc.invalidateQueries({ queryKey: onboardingKeys.flow(token) }),
  });
}

/** Submit onboarding payments (deposit + advance rent). */
export function useSubmitOnboardingPayments(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payments: OnboardingPaymentItem[]) =>
      onboardingFlowApi.submitPayments(token, payments),
    onSuccess: () => qc.invalidateQueries({ queryKey: onboardingKeys.flow(token) }),
  });
}

/** Confirm a single onboarding payment (manager action). */
export function useConfirmOnboardingPayment(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paymentId: string) => onboardingFlowApi.confirmPayment(token, paymentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: onboardingKeys.flow(token) }),
  });
}

/** Sign final agreement. Auto-activates lease on success. */
export function useSignAgreement(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (signatureDataUrl: string) =>
      onboardingFlowApi.signAgreement(token, signatureDataUrl),
    onSuccess: () => qc.invalidateQueries({ queryKey: onboardingKeys.flow(token) }),
  });
}
