import { apiGet, apiPost, apiPut, apiDelete } from "./client";
import type { Notification, NotificationTemplate, NotificationStats, PaginatedResponse, QueryParams } from "@/types";
import { toNotificationParams } from "@/utils/backendParams";

export const notificationsApi = {
  list: (params?: QueryParams) =>
    apiGet<PaginatedResponse<Notification>>("/notifications", toNotificationParams(params)),

  get: (id: string) =>
    apiGet<Notification>(`/notifications/${id}`),

  send: (data: Omit<Notification, "id" | "state" | "queuedAt" | "retryCount">) =>
    apiPost<Notification>("/notifications/send", data),

  getStats: () =>
    apiGet<NotificationStats>("/notifications/stats"),

  // Templates
  listTemplates: () =>
    apiGet<NotificationTemplate[]>("/notification-templates"),

  getTemplate: (id: string) =>
    apiGet<NotificationTemplate>(`/notification-templates/${id}`),

  createTemplate: (data: Omit<NotificationTemplate, "id" | "createdAt" | "updatedAt">) =>
    apiPost<NotificationTemplate>("/notification-templates", data),

  updateTemplate: (id: string, data: Partial<NotificationTemplate>) =>
    apiPut<NotificationTemplate>(`/notification-templates/${id}`, data),

  deleteTemplate: (id: string) =>
    apiDelete<void>(`/notification-templates/${id}`),

  // Preview with sample data
  previewTemplate: (templateId: string, variables: Record<string, string>) =>
    apiPost<{ subject?: string; body: string }>(`/notification-templates/${templateId}/preview`, { variables }),
};
