"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { landlordsApi, type CreateLandlordInviteRequest } from "@/services/api/landlords";

const KEY = ["landlord-invites"] as const;

export function useLandlordInvites() {
  return useQuery({
    queryKey: KEY,
    queryFn: landlordsApi.listInvites,
    staleTime: 2 * 60_000,
  });
}

export function useCreateLandlordInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateLandlordInviteRequest) => landlordsApi.createInvite(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRevokeLandlordInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => landlordsApi.revokeInvite(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useResendLandlordInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => landlordsApi.resendInvite(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
