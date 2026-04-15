import type { OnboardingState } from "./states";

export type TenantStatus = "active" | "inactive" | "blacklisted";
export type IdDocumentType = "passport" | "national_id" | "driving_licence" | "residence_permit";

export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
  email?: string;
}

export interface TenantDocument {
  id: string;
  tenantId: string;
  type: IdDocumentType | "proof_of_income" | "reference_letter" | "bank_statement" | "other";
  name: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  verified: boolean;
  uploadedAt: string;
  expiresAt?: string;
}

/** Partial wizard progress saved server-side so the tenant can resume. */
export interface OnboardingDraft {
  step: "profile" | "documents" | "signature";
  phone?: string;
  dateOfBirth?: string;
  nationality?: string;
  nin?: string;
  whatsappNumber?: string;
  mobileMoneyProvider?: "mtn" | "airtel" | "";
  mobileMoneyNumber?: string;
  emergencyContact?: EmergencyContact;
}

export interface Tenant {
  id: string;
  userId?: string; // linked Logto user
  landlordId: string;
  // Personal details
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth?: string;
  nationality?: string;
  // Identity & payment
  nin?: string;
  whatsappNumber?: string;
  mobileMoneyProvider?: "mtn" | "airtel";
  mobileMoneyNumber?: string;
  // Status
  status: TenantStatus;
  onboardingState: OnboardingState;
  onboardingToken?: string;
  onboardingCompletedAt?: string;
  rejectionReason?: string;
  // Current placement
  currentPropertyId?: string;
  currentUnitId?: string;
  currentLeaseId?: string;
  // Meta
  emergencyContact?: EmergencyContact;
  onboardingDraft?: OnboardingDraft;
  documents: TenantDocument[];
  notes?: string;
  tags: string[];
  // GDPR
  gdprConsentAt?: string;
  dataRetentionUntil?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OnboardingDocumentPayload {
  type: TenantDocument["type"];
  name: string;
  url: string;
  key: string;
  mimeType: string;
  sizeBytes: number;
  expiresAt?: string;
}

export interface OnboardingSubmitPayload {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  dateOfBirth?: string;
  nationality?: string;
  nin?: string;
  whatsappNumber?: string;
  mobileMoneyProvider?: "mtn" | "airtel" | "";
  mobileMoneyNumber?: string;
  gdprConsent: boolean;
  documents: OnboardingDocumentPayload[];
}

export interface TenantInvite {
  id: string;
  landlordId: string;
  propertyId: string;
  unitId?: string;
  leaseId?: string;  // linked draft lease — drives the payment flow
  email: string;
  name: string;
  token: string;
  expiresAt: string;
  sentAt: string;
  status: "pending" | "accepted" | "expired";
}
