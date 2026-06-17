import { apiGet } from "./client";

export interface ListingAddress {
  line1: string | null;
  city: string | null;
  parish: string | null;
  district: string | null;
}

export interface Listing {
  unitId: string;
  unitName: string;
  unitType: string;
  monthlyRent: number;
  currency: string;
  bedrooms: number;
  bathrooms: number;
  area: number | null;
  furnishedStatus: string;
  amenities: string[];
  unitImages: string[];
  geocode: string | null;
  propertyId: string;
  propertyName: string;
  propertyType: string;
  coverImage: string | null;
  propertyImages: string[];
  address: ListingAddress;
  propertyAmenities: string[];
  orgId: string;
  orgName: string;
  orgContactPhone: string | null;
  orgContactEmail: string | null;
}

export interface ListingsResponse {
  items: Listing[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListingsFilter {
  page?: number;
  pageSize?: number;
  unitType?: string;
  minRent?: number;
  maxRent?: number;
  district?: string;
}

export const listingsApi = {
  list: (filter: ListingsFilter = {}): Promise<ListingsResponse> => {
    const params: Record<string, string | number> = {};
    if (filter.page) params.page = filter.page;
    if (filter.pageSize) params.page_size = filter.pageSize;
    if (filter.unitType) params.unit_type = filter.unitType;
    if (filter.minRent != null) params.min_rent = filter.minRent;
    if (filter.maxRent != null) params.max_rent = filter.maxRent;
    if (filter.district) params.district = filter.district;
    return apiGet<ListingsResponse>("/public/listings", params);
  },
};
