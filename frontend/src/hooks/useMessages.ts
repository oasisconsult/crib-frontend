"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryClient";
import { messagesApi } from "@/services/api/messages";
import { toast } from "@/store/useUIStore";

export function useMessages(leaseId: string, page = 1) {
  return useQuery({
    queryKey: queryKeys.messages.list(leaseId, page),
    queryFn: () => messagesApi.list(leaseId, page),
    enabled: !!leaseId,
    refetchInterval: 15_000,
  });
}

export function useSendMessage(leaseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => messagesApi.send(leaseId, content),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.messages.all() });
    },
    onError: () => toast.error("Failed to send message"),
  });
}

export function useMarkMessageRead(leaseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) => messagesApi.markRead(leaseId, messageId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.messages.all() });
    },
  });
}

export function useUnreadMessageCount() {
  return useQuery({
    queryKey: queryKeys.messages.unreadCount(),
    queryFn: () => messagesApi.unreadCount(),
    refetchInterval: 30_000,
    staleTime: 20_000,
  });
}

export function useAllMessages(page = 1, unreadOnly = false) {
  return useQuery({
    queryKey: queryKeys.messages.listAll(page, unreadOnly),
    queryFn: () => messagesApi.listAll(page, 20, unreadOnly),
    refetchInterval: 30_000,
  });
}
