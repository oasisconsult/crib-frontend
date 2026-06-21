import { apiGet } from "./client";

export interface AgencyListItem {
  id: string;
  name: string;
  slug: string;
  plan: string;
  country: string | null;
  currency: string | null;
  totalProperties: number;
  activeProperties: number;
  inactiveProperties: number;
  managerCount: number;
  landlordCount: number;
  isArchived: boolean;
  createdAt: string;
}

export interface AgencyManager {
  id: string;
  displayName: string | null;
  email: string | null;
  role: string;
}

export interface AgencyLandlord {
  id: string;
  displayName: string | null;
  email: string | null;
  propertyCount: number;
}

export interface AgencyProperty {
  id: string;
  name: string;
  type: string;
  status: string;
  unitCount: number;
  monthlyRevenue: number;
  address: string;
}

export interface AgencyDetail extends AgencyListItem {
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  totalMonthlyRevenue: number;
  managers: AgencyManager[];
  landlords: AgencyLandlord[];
  properties: AgencyProperty[];
}

export interface LandlordListItem {
  id: string;
  displayName: string | null;
  email: string | null;
  role: "owner" | "landlord";
  isReadOnly: boolean;
  orgId: string | null;
  orgName: string | null;
  propertyCount: number;
  activePropertyCount: number;
  type: "independent" | "agency_managed";
  createdAt: string;
}

export interface LandlordProperty {
  id: string;
  name: string;
  type: string;
  status: string;
  unitCount: number;
  monthlyRevenue: number;
  address: string;
}

export interface LandlordDetail extends LandlordListItem {
  phone: string | null;
  inactivePropertyCount: number;
  totalMonthlyRevenue: number;
  properties: LandlordProperty[];
}

interface PagedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const adminOrgsApi = {
  listAgencies: (params?: { page?: number; pageSize?: number; search?: string }) =>
    apiGet<PagedResponse<AgencyListItem>>("/admin/agencies", params),

  getAgency: (orgId: string) =>
    apiGet<AgencyDetail>(`/admin/agencies/${orgId}`),

  listLandlords: (params?: { page?: number; pageSize?: number; search?: string }) =>
    apiGet<PagedResponse<LandlordListItem>>("/admin/landlords", params),

  getLandlord: (profileId: string) =>
    apiGet<LandlordDetail>(`/admin/landlords/${profileId}`),
};
