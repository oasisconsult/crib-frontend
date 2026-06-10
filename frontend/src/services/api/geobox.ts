import type { AreaResult } from "@/types/geobox";
import { apiGet } from "./client";

interface AreaSearchResponse {
  areas: AreaResult[];
  total: number;
}

interface HierarchyResponse {
  /** [district, county, division, parish, village] or null */
  hierarchy: string[] | null;
}

export const geoboxApi = {
  searchVillages: (q: string, limit = 10) =>
    apiGet<AreaSearchResponse>("/geobox/villages/search", { q, limit }),

  getNearbyAreas: (lat: number, lng: number, limit = 5) =>
    apiGet<AreaSearchResponse>("/geobox/areas/nearby", { lat, lng, limit }),

  resolveGeocode: (code: string) =>
    apiGet<HierarchyResponse>("/geobox/geocode/hierarchy", { code }),
};
