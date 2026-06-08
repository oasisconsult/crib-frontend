import { apiGet, apiPatch } from "./client";
import type { PaginatedResponse } from "@/types";

export type DemoBookingStatus = "pending" | "confirmed" | "cancelled" | "completed";

export interface DemoBooking {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string | null;
  portfolioSize: string | null;
  message: string | null;
  marketingConsent: boolean;
  consentGivenAt: string | null;
  slotDate: string;
  slotTime: string;
  timezone: string;
  status: DemoBookingStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DemoBookingListParams {
  status?: DemoBookingStatus | "";
  search?: string;
  page?: number;
  pageSize?: number;
}

export const demoBookingsApi = {
  list: (params?: DemoBookingListParams) =>
    apiGet<PaginatedResponse<DemoBooking>>("/demo-bookings", {
      status: params?.status || undefined,
      search: params?.search || undefined,
      page: params?.page,
      pageSize: params?.pageSize,
    }),

  updateStatus: (id: string, status: DemoBookingStatus) =>
    apiPatch<DemoBooking>(`/demo-bookings/${id}/status`, { status }),
};
