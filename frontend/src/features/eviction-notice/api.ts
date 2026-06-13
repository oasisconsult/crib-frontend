import { apiGet, apiPatch, apiPost } from "@/services/api/client";
import type { EvictionNotice, EvictionNoticeCreate, EvictionNoticeListOut } from "./types";

const base = (leaseId: string) => `/leases/${leaseId}/eviction-notices`;

export const evictionNoticeApi = {
  list: (leaseId: string) =>
    apiGet<EvictionNoticeListOut>(base(leaseId)),

  get: (leaseId: string, noticeId: string) =>
    apiGet<EvictionNotice>(`${base(leaseId)}/${noticeId}`),

  create: (leaseId: string, body: EvictionNoticeCreate) =>
    apiPost<EvictionNotice>(base(leaseId), body),

  serve: (leaseId: string, noticeId: string) =>
    apiPatch<EvictionNotice>(`${base(leaseId)}/${noticeId}/serve`, {}),

  dispute: (leaseId: string, noticeId: string, grounds?: string) =>
    apiPatch<EvictionNotice>(`${base(leaseId)}/${noticeId}/dispute`, { grounds }),

  withdraw: (leaseId: string, noticeId: string, reason?: string) =>
    apiPatch<EvictionNotice>(`${base(leaseId)}/${noticeId}/withdraw`, { reason }),

  execute: (leaseId: string, noticeId: string) =>
    apiPatch<EvictionNotice>(`${base(leaseId)}/${noticeId}/execute`, {}),

  noticePdfUrl: (leaseId: string, noticeId: string) =>
    `/api/v1/leases/${leaseId}/eviction-notices/${noticeId}/notice.pdf`,
};
