"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryClient";
import { notificationsApi } from "@/services/api/notifications";
import { toast } from "@/store/useUIStore";
import type { NotificationTemplate, QueryParams } from "@/types";

export function useNotifications(params?: QueryParams) {
  return useQuery({
    queryKey: queryKeys.notifications.list(params),
    queryFn: () => notificationsApi.list(params),
  });
}

export function useNotificationStats() {
  return useQuery({
    queryKey: queryKeys.notifications.stats(),
    queryFn: notificationsApi.getStats,
  });
}

export function useNotificationTemplates() {
  return useQuery({
    queryKey: queryKeys.notifications.templates(),
    queryFn: notificationsApi.listTemplates,
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      data: Omit<NotificationTemplate, "id" | "createdAt" | "updatedAt">,
    ) => notificationsApi.createTemplate(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notifications.templates() });
      toast.success("Template created");
    },
    onError: () => toast.error("Failed to create template"),
  });
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<NotificationTemplate>;
    }) => notificationsApi.updateTemplate(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notifications.templates() });
      toast.success("Template saved");
    },
    onError: () => toast.error("Failed to save template"),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationsApi.deleteTemplate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notifications.templates() });
      toast.success("Template deleted");
    },
    onError: () => toast.error("Failed to delete template"),
  });
}

export function useSendNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: notificationsApi.send,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notifications.all() });
      toast.success("Notification sent");
    },
    onError: () => toast.error("Failed to send notification"),
  });
}
