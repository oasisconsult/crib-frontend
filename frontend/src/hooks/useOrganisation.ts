"use client";

import { isAxiosError } from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { organisationsApi, type Organisation, type UpdateOrganisationRequest, type ProvisionOrganisationRequest } from "@/services/api/organisations";

const ORG_KEY = ["organisation", "me"] as const;

export function useOrganisation() {
  return useQuery<Organisation | null>({
    queryKey: ORG_KEY,
    queryFn: async () => {
      try {
        return await organisationsApi.getMe();
      } catch (err) {
        // Superadmin (and any user with no org) legitimately has no organisation.
        // Treat 404 as null so callers can check `org == null` rather than
        // catching an unhandled query error.
        if (isAxiosError(err) && err.response?.status === 404) return null;
        throw err;
      }
    },
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

export function useProvisionOrganisation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ProvisionOrganisationRequest) => organisationsApi.provision(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ORG_KEY }),
  });
}
