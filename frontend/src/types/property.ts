export type PropertyType = "flat" | "house" | "hostel" | "commercial" | "villa";
export type PropertyStatus = "active" | "inactive" | "maintenance";

export interface PropertyAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  lat?: number;
  lng?: number;
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
  rules: PropertyRules;
  landlordId: string;
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
  createdAt: string;
  updatedAt: string;
}

export type UnitStatus = "available" | "occupied" | "reserved" | "maintenance";
export type UnitType = "single" | "double" | "studio" | "ensuite" | "shared";

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
  createdAt: string;
  updatedAt: string;
}
