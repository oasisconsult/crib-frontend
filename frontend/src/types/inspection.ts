import type { InspectionState, MaintenanceState } from "./states";

export type InspectionType = "move_in" | "move_out" | "routine" | "maintenance" | "complaint";

export interface ChecklistItem {
  id: string;
  area: string;
  description: string;
  condition: "excellent" | "good" | "fair" | "poor" | "damaged" | null;
  notes?: string;
  photoUrls: string[];
  required: boolean;
}

export interface Inspection {
  id: string;
  state: InspectionState;
  type: InspectionType;
  // Location
  propertyId: string;
  unitId: string;
  // Parties
  landlordId: string;
  tenantId?: string;
  inspectorId?: string;
  inspectorName?: string;
  // Schedule
  scheduledDate: string;
  scheduledTimeSlot?: string;
  startedAt?: string;
  completedAt?: string;
  approvedAt?: string;
  // Content
  checklist: ChecklistItem[];
  overallCondition?: "excellent" | "good" | "fair" | "poor";
  summary?: string;
  recommendations?: string;
  // Media
  photoUrls: string[];
  videoUrls: string[];
  // Signatures
  tenantSignedAt?: string;
  landlordSignedAt?: string;
  landlordSignedBy?: string;
  // Report
  reportPdfUrl?: string;
  signToken?: string;
  signTokenExpiresAt?: string;
  // Linked
  leaseId?: string;
  maintenanceIssueIds: string[];
  createdAt: string;
  updatedAt: string;
  // Denormalised display names
  unitName?: string;
  propertyName?: string;
}

export type ContractorSpecialty =
  | "plumbing" | "electrical" | "structural" | "appliance"
  | "pest" | "security" | "other";

export interface Contractor {
  id: string;
  organisationId: string;
  name: string;
  phone?: string;
  email?: string;
  specialty?: ContractorSpecialty;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceIssue {
  id: string;
  reference?: string;
  state: MaintenanceState;
  // Location
  propertyId: string;
  unitId?: string;
  // Denormalised display names
  propertyName?: string;
  unitName?: string;
  // Reporter
  reportedBy: "tenant" | "landlord" | "inspector";
  reportedById: string;
  // Details
  title: string;
  description: string;
  category: "plumbing" | "electrical" | "structural" | "appliance" | "pest" | "security" | "other";
  priority: "low" | "medium" | "high" | "urgent";
  // Assignment
  contractorId?: string;
  assignedTo?: string;
  assignedAt?: string;
  estimatedCost?: number;
  actualCost?: number;
  currency?: string;
  // Dates
  reportedAt: string;
  startedAt?: string;
  resolvedAt?: string;
  closedAt?: string;
  // Media
  photoUrls: string[];
  // Linked
  inspectionId?: string;
  leaseId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
