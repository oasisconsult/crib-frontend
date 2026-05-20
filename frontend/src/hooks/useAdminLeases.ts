"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminLeasesApi, type AdminLeaseListParams, type LeaseBillingRulesPatch } from "@/services/api/adminLeases";

const QUERY_KEY = "admin-leases";

export function useAdminLeases(params: AdminLeaseListParams) {
  return useQuery({
    queryKey: [QUERY_KEY, params],
    queryFn: () => adminLeasesApi.list(params),
    placeholderData: (prev) => prev,
  });
}

export function usePatchLeaseBillingRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ leaseId, body }: { leaseId: string; body: LeaseBillingRulesPatch }) =>
      adminLeasesApi.patchBillingRules(leaseId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}
