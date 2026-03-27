"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryClient";
import { propertiesApi } from "@/services/api/properties";
import { toast } from "@/store/useUIStore";
import type { Property, Unit, PropertyRules, QueryParams } from "@/types";

export function useProperties(params?: QueryParams) {
  return useQuery({
    queryKey: queryKeys.properties.list(params),
    queryFn: () => propertiesApi.list(params),
  });
}

export function useProperty(id: string) {
  return useQuery({
    queryKey: queryKeys.properties.detail(id),
    queryFn: () => propertiesApi.get(id),
    enabled: !!id,
  });
}

export function useCreateProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Property, "id" | "createdAt" | "updatedAt">) =>
      propertiesApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.properties.all() });
      toast.success("Property created successfully");
    },
    onError: () => toast.error("Failed to create property"),
  });
}

export function useUpdateProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Property> }) =>
      propertiesApi.update(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.properties.detail(id) });
      qc.invalidateQueries({ queryKey: queryKeys.properties.all() });
      toast.success("Property updated");
    },
    onError: () => toast.error("Failed to update property"),
  });
}

export function useUpdatePropertyRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, rules }: { id: string; rules: PropertyRules }) =>
      propertiesApi.updateRules(id, rules),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.properties.detail(id) });
      toast.success("Rules saved");
    },
    onError: () => toast.error("Failed to save rules"),
  });
}

export function useDeleteProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => propertiesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.properties.all() });
      toast.success("Property deleted");
    },
    onError: () => toast.error("Failed to delete property"),
  });
}

// Units
export function useUnit(propertyId: string, unitId: string) {
  return useQuery({
    queryKey: [...queryKeys.properties.units(propertyId), unitId],
    queryFn: () => propertiesApi.getUnit(propertyId, unitId),
    enabled: !!propertyId && !!unitId,
  });
}

export function useUnits(propertyId: string, params?: QueryParams) {
  return useQuery({
    queryKey: queryKeys.properties.units(propertyId, params),
    queryFn: () => propertiesApi.listUnits(propertyId, params),
    enabled: !!propertyId,
  });
}

export function useCreateUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      propertyId,
      data,
    }: {
      propertyId: string;
      data: Omit<Unit, "id" | "createdAt" | "updatedAt">;
    }) => propertiesApi.createUnit(propertyId, data),
    onSuccess: (_, { propertyId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.properties.units(propertyId) });
      toast.success("Unit created");
    },
    onError: () => toast.error("Failed to create unit"),
  });
}

export function useBulkUpdateUnits() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      propertyId,
      unitIds,
      data,
    }: {
      propertyId: string;
      unitIds: string[];
      data: Partial<Unit>;
    }) => propertiesApi.bulkUpdateUnits(propertyId, unitIds, data),
    onSuccess: (_, { propertyId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.properties.units(propertyId) });
      toast.success("Units updated");
    },
    onError: () => toast.error("Failed to update units"),
  });
}
