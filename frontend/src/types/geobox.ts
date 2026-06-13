export interface AreaResult {
  id: string;
  name: string;
  parentName?: string;
  /** [district, county, division, parish, village] */
  hierarchy?: string[];
}

/** Parsed from AreaResult.hierarchy — indices are fixed by GeoBox SDK */
export interface AddressHierarchy {
  district:  string;
  county:    string;
  division:  string;  // sub-county / town council
  parish:    string;
  village:   string;
}

export function parseHierarchy(h: string[]): AddressHierarchy | null {
  if (!h || h.length < 5) return null;
  return { district: h[0], county: h[1], division: h[2], parish: h[3], village: h[4] };
}
