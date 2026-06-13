import { apiGet, apiPatch, apiPost } from "@/services/api/client";
import type {
  RentIncrease,
  RentIncreaseCreate,
  RentIncreaseListOut,
  RentIncreaseWithdraw,
} from "./types";

const base = (leaseId: string) => `/leases/${leaseId}/rent-increases`;

export const rentIncreaseApi = {
  list: (leaseId: string) =>
    apiGet<RentIncreaseListOut>(base(leaseId)),

  get: (leaseId: string, increaseId: string) =>
    apiGet<RentIncrease>(`${base(leaseId)}/${increaseId}`),

  create: (leaseId: string, body: RentIncreaseCreate) =>
    apiPost<RentIncrease>(base(leaseId), body),

  acknowledge: (leaseId: string, increaseId: string) =>
    apiPatch<RentIncrease>(`${base(leaseId)}/${increaseId}/acknowledge`, {}),

  withdraw: (leaseId: string, increaseId: string, body: RentIncreaseWithdraw) =>
    apiPatch<RentIncrease>(`${base(leaseId)}/${increaseId}/withdraw`, body),

  noticePdfUrl: (leaseId: string, increaseId: string) =>
    `/api/v1/leases/${leaseId}/rent-increases/${increaseId}/notice.pdf`,
};
