"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { agencyInvitesApi, type CreateAgencyInviteRequest } from "@/services/api/agencyInvites";

const KEY = ["agency-invites"] as const;

export function useAgencyInvites() {
  return useQuery({
    queryKey: KEY,
    queryFn: agencyInvitesApi.list,
    staleTime: 2 * 60_000,
  });
}

export function useCreateAgencyInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAgencyInviteRequest) => agencyInvitesApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useResendAgencyInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => agencyInvitesApi.resend(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRevokeAgencyInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => agencyInvitesApi.revoke(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
