"use client";

import { useQuery } from "@tanstack/react-query";
import { keepPreviousData } from "@tanstack/react-query";
import { adminOrgsApi } from "@/services/api/adminOrgs";

export function useAdminAgencies(params?: { page?: number; pageSize?: number; search?: string }) {
  return useQuery({
    queryKey: ["admin", "agencies", params],
    queryFn: () => adminOrgsApi.listAgencies(params),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useAdminAgency(orgId: string | null) {
  return useQuery({
    queryKey: ["admin", "agencies", orgId],
    queryFn: () => adminOrgsApi.getAgency(orgId!),
    enabled: !!orgId,
    staleTime: 30_000,
  });
}

export function useAdminLandlords(params?: { page?: number; pageSize?: number; search?: string }) {
  return useQuery({
    queryKey: ["admin", "landlords-dir", params],
    queryFn: () => adminOrgsApi.listLandlords(params),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useAdminLandlord(profileId: string | null) {
  return useQuery({
    queryKey: ["admin", "landlords-dir", profileId],
    queryFn: () => adminOrgsApi.getLandlord(profileId!),
    enabled: !!profileId,
    staleTime: 30_000,
  });
}
