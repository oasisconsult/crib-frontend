"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { organisationsApi, type UpdateOrganisationRequest } from "@/services/api/organisations";

const ORG_KEY = ["organisation", "me"] as const;

export function useOrganisation() {
  return useQuery({
    queryKey: ORG_KEY,
    queryFn: organisationsApi.getMe,
    staleTime: 5 * 60_000,
  });
}

export function useUpdateOrganisation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateOrganisationRequest) => organisationsApi.updateMe(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ORG_KEY }),
  });
}
