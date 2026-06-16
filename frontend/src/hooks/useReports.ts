"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryClient";
import { reportsApi } from "@/services/api/reports";

export function usePortfolioSummary() {
  return useQuery({
    queryKey: queryKeys.reports.portfolio(),
    queryFn: () => reportsApi.portfolio(),
    staleTime: 1000 * 60 * 5,
  });
}

export function useRentCollectionReport(params?: { dateFrom?: string; dateTo?: string; propertyId?: string }) {
  return useQuery({
    queryKey: queryKeys.reports.rentCollection(params),
    queryFn: () => reportsApi.rentCollection(params),
    staleTime: 1000 * 60 * 5,
  });
}

export function useRentArrearsReport(params?: { propertyId?: string }) {
  return useQuery({
    queryKey: queryKeys.reports.rentArrears(params),
    queryFn: () => reportsApi.rentArrears(params),
    staleTime: 1000 * 60 * 3,
  });
}

export function useOccupancyReport(params?: { propertyId?: string }) {
  return useQuery({
    queryKey: queryKeys.reports.occupancy(params),
    queryFn: () => reportsApi.occupancy(params),
    staleTime: 1000 * 60 * 10,
  });
}

export function useMaintenanceOverviewReport(params?: {
  propertyId?: string;
  contractorId?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  return useQuery({
    queryKey: queryKeys.reports.maintenanceOverview(params),
    queryFn: () => reportsApi.maintenanceOverview(params),
    staleTime: 1000 * 60 * 5,
  });
}

export function useMaintenanceCostReport(params?: { propertyId?: string; dateFrom?: string; dateTo?: string }) {
  return useQuery({
    queryKey: queryKeys.reports.maintenanceCosts(params),
    queryFn: () => reportsApi.maintenanceCosts(params),
    staleTime: 1000 * 60 * 10,
  });
}

export function useContractorPerformance(params?: { dateFrom?: string; dateTo?: string }) {
  return useQuery({
    queryKey: queryKeys.reports.contractors(params),
    queryFn: () => reportsApi.contractors(params),
    staleTime: 1000 * 60 * 30,
  });
}

export function useLeaseExpiryReport() {
  return useQuery({
    queryKey: queryKeys.reports.leaseExpiry(),
    queryFn: () => reportsApi.leaseExpiry(),
    staleTime: 1000 * 60 * 30,
  });
}

export function useIncomeExpenseReport(params?: { groupBy?: string; months?: number }) {
  return useQuery({
    queryKey: queryKeys.reports.incomeExpense(params),
    queryFn: () => reportsApi.incomeExpense(params),
    staleTime: 1000 * 60 * 30,
  });
}
