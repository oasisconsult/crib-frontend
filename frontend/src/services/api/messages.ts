import { apiGet, apiPatch, apiPost } from "./client";

export interface Message {
  id: string;
  organisationId: string;
  leaseId: string | null;
  senderId: string;
  senderName: string;
  senderRole: string;
  content: string;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessagePage {
  data: Message[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
}

export const messagesApi = {
  list: (leaseId: string, page = 1, pageSize = 50) =>
    apiGet<MessagePage>(`/leases/${leaseId}/messages`, { page, pageSize }),

  send: (leaseId: string, content: string) =>
    apiPost<Message>(`/leases/${leaseId}/messages`, { leaseId, content }),

  markRead: (leaseId: string, messageId: string) =>
    apiPatch<Message>(`/leases/${leaseId}/messages/${messageId}/read`, {}),

  unreadCount: () =>
    apiGet<{ count: number }>("/messages/unread-count"),

  listAll: (page = 1, pageSize = 20, unreadOnly = false) =>
    apiGet<MessagePage>("/messages", { page, pageSize, unreadOnly }),
};
