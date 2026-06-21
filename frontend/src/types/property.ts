export type PropertyType =
  | "flat" | "house" | "hostel" | "commercial" | "villa"
  | "bungalow" | "maisonette" | "townhouse" | "bedsitter_block";

export type PropertyStatus = "active" | "inactive" | "maintenance";

export type FurnishedStatus = "unfurnished" | "semi_furnished" | "furnished";
export type WaterSource = "municipal" | "borehole" | "tank" | "multiple";
export type BackupPower = "none" | "solar" | "generator" | "both";
export type InternetType = "none" | "wifi" | "fibre";
export type CompoundType = "private" | "shared";

export interface PropertyAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  lat?: number;
  lng?: number;
  // GeoBox admin hierarchy — autofilled from geocode or village search
  village?:   string;
  parish?:    string;
  subCounty?: string;  // division / sub-county / town council
  county?:    string;
  district?:  string;
}

export interface PropertyRules {
  gracePeriodDays: number;
  lateFeeType: "flat" | "percentage";
  lateFeeValue: number;
  lateFeeCapAmount?: number;
  depositMonths: number;
  advanceRentMonths: number;
  minimumLeaseMonths: number;
  maxOccupants: number;
  noticePeriodDays: number;
  allowSubletting: boolean;
  allowPets: boolean;
  allowSmoking: boolean;
  rentDayOfMonth: number;
  billingCurrency: string;
  maintenanceWindowHours: number;
}

export interface Property {
  id: string;
  name: string;
  type: PropertyType;
  status: PropertyStatus;
  address: PropertyAddress;
  geocode?: string;
  rules: PropertyRules;
  landlordId: string;
  orgName: string | null;
  isAgency: boolean;
  ownerProfileId: string | null;
  coverImage?: string;
  images?: string[];
  totalUnits: number;
  occupiedUnits: number;
  occupancyRate: number;
  monthlyRevenue: number;
  currency: string;
  tags: string[];
  amenities: string[];
  description?: string;
  /**
   * When true this property is rented as a whole (no individual units).
   * The backend auto-creates a single virtual unit "Main Property".
   */
  isSingleUnit?: boolean;
  // Uganda property features
  totalFloors?: number;
  yearBuilt?: number;
  landSizeAcres?: number;
  hasPerimeterWall?: boolean;
  hasGate?: boolean;
  hasGuard?: boolean;
  hasCctv?: boolean;
  totalParkingSpaces?: number;
  waterSource?: WaterSource;
  backupPower?: BackupPower;
  internetType?: InternetType;
  compoundType?: CompoundType;
  createdAt: string;
  updatedAt: string;
}

export type UnitStatus = "available" | "occupied" | "reserved" | "maintenance";

// Current Uganda bedroom-count labels (preferred for new units)
export type UnitType =
  | "studio" | "bedsitter"
  | "one_bed" | "two_bed" | "three_bed" | "four_bed_plus"
  // Legacy values — still valid in DB but not shown in new-unit dropdowns
  | "single" | "double" | "ensuite" | "shared";

export interface Unit {
  id: string;
  propertyId: string;
  name: string;
  type: UnitType;
  status: UnitStatus;
  floor?: number;
  area?: number; // sqm
  monthlyRent: number;
  currency: string;
  bedrooms: number;
  bathrooms: number;
  amenities: string[];
  images: string[];
  currentTenantId?: string;
  currentLeaseId?: string;
  lastInspectionDate?: string;
  notes?: string;
  // Per-unit rule overrides; when absent the property-level rules apply
  rules?: PropertyRules;
  // Uganda unit features
  sittingRooms?: number;
  toilets?: number;
  isSelfContained?: boolean;
  hasKitchen?: boolean;
  hasStore?: boolean;
  hasDomesticQuarters?: boolean;
  parkingSpaces?: number;
  furnishedStatus?: FurnishedStatus;
  waterSource?: WaterSource;
  createdAt: string;
  updatedAt: string;
}
