"use client";

import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryClient";
import { leasesApi } from "@/services/api/leases";
import { toast } from "@/store/useUIStore";
import type { Lease, QueryParams } from "@/types";
import type { LeaseEvent } from "@/types/states";

export function useLeases(params?: QueryParams) {
  return useQuery({
    queryKey: queryKeys.leases.list(params),
    queryFn: () => leasesApi.list(params),
    placeholderData: keepPreviousData,
  });
}

export function useLease(id: string) {
  return useQuery({
    queryKey: queryKeys.leases.detail(id),
    queryFn: () => leasesApi.get(id),
    enabled: !!id,
  });
}

export function useLeaseAudit(id: string) {
  return useQuery({
    queryKey: queryKeys.leases.audit(id),
    queryFn: () => leasesApi.getAudit(id),
    enabled: !!id,
  });
}

export function useCreateLease() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Lease, "id" | "createdAt" | "updatedAt" | "state">) =>
      leasesApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.leases.all() });
      toast.success("Lease created");
    },
    onError: () => toast.error("Failed to create lease"),
  });
}

export function useTransitionLease() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      event,
      payload,
    }: {
      id: string;
      event: LeaseEvent;
      payload?: object;
    }) => leasesApi.transition(id, event, payload),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.leases.detail(id) });
      qc.invalidateQueries({ queryKey: queryKeys.leases.audit(id) });
      toast.success("Lease updated");
    },
    onError: () => toast.error("Invalid lease transition"),
  });
}

export function useConfirmOnboardingPayments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => leasesApi.confirmOnboardingPayments(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.leases.detail(id) });
      qc.invalidateQueries({ queryKey: queryKeys.payments.all() });
      toast.success("Payments confirmed — tenant can now sign the agreement");
    },
    onError: () => toast.error("Failed to confirm payments"),
  });
}

export function useSendOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => leasesApi.sendOnboarding(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.leases.detail(id) });
    },
    onError: () => toast.error("Failed to send onboarding link"),
  });
}

export function usePresignAgreement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, signatureDataUrl }: { id: string; signatureDataUrl: string }) =>
      leasesApi.presignAgreement(id, signatureDataUrl),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.leases.detail(id) });
      toast.success("Agreement pre-signed — tenant will sign during onboarding");
    },
    onError: () => toast.error("Failed to pre-sign agreement"),
  });
}

export function useGenerateLeaseDocument() {
  return useMutation({
    mutationFn: (id: string) => leasesApi.generateDocument(id),
    onError: () => toast.error("Failed to generate document"),
  });
}

export function useSignLease() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      party,
      signatureDataUrl,
    }: {
      id: string;
      party: "tenant" | "landlord";
      signatureDataUrl: string;
    }) => leasesApi.signLease(id, { party, signatureDataUrl }),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.leases.detail(id) });
      toast.success("Lease signed");
    },
    onError: () => toast.error("Failed to sign lease"),
  });
}


export function useAcknowledgeLease() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => leasesApi.acknowledge(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.leases.detail(id) });
      qc.invalidateQueries({ queryKey: queryKeys.leases.list() });
      toast.success("Agreement acknowledged", "Paper agreement recorded for this lease");
    },
    onError: () => toast.error("Failed to acknowledge agreement"),
  });
}

export function useConfirmLeaseTerms() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => leasesApi.confirmTerms(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.leases.detail(id) });
      qc.invalidateQueries({ queryKey: queryKeys.leases.list() });
    },
    onError: () => toast.error("Failed to confirm terms"),
  });
}
