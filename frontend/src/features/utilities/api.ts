import { apiClient } from "@/services/api/client";
import type { UtilityReading } from "./types";

export interface RecordReadingBody {
  utilityType: string;
  billingType: string;
  readingDate: string;
  readingValue?: number;
  previousValue?: number;
  unitPrice?: number;
  amount?: number;
  currency: string;
  notes?: string;
  autoBill: boolean;
}

export const utilitiesApi = {
  async list(leaseId: string, page = 1): Promise<{ data: UtilityReading[]; total: number }> {
    const { data } = await apiClient.get(`/leases/${leaseId}/utilities`, {
      params: { page, pageSize: 20 },
    });
    return data;
  },

  async record(leaseId: string, body: RecordReadingBody): Promise<UtilityReading> {
    const { data } = await apiClient.post<UtilityReading>(`/leases/${leaseId}/utilities`, body);
    return data;
  },

  async bill(leaseId: string, readingId: string): Promise<UtilityReading> {
    const { data } = await apiClient.post<UtilityReading>(
      `/leases/${leaseId}/utilities/${readingId}/bill`
    );
    return data;
  },
};
