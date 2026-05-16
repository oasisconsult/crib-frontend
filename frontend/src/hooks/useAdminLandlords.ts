"use client";

import { useMutation } from "@tanstack/react-query";
import { landlordsApi, type AssignToAgencyRequest } from "@/services/api/landlords";

export function useMigrateToPersonalOrg() {
  return useMutation({
    mutationFn: (profileId: string) => landlordsApi.adminMigrateToPersonalOrg(profileId),
  });
}

export function useAssignToAgency() {
  return useMutation({
    mutationFn: ({ profileId, body }: { profileId: string; body: AssignToAgencyRequest }) =>
      landlordsApi.adminAssignToAgency(profileId, body),
  });
}
