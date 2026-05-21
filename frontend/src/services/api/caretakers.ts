/**
 * Caretaker Delegation API
 *
 * A caretaker is invited by an owner/landlord to manage a specific subset of their
 * properties. The caretaker gets a "caretaker" role scoped to those propertyIds.
 *
 * One landlord can have multiple caretakers (each with their own scope + permission level).
 * One caretaker belongs to exactly one landlord.
 *
 * Backend enforces property scoping on every API call; this file is the frontend contract.
 */

import { apiGet, apiPost, apiDelete, apiPatch } from "./client";

// ── Types ──────────────────────────────────────────────────────────────────────

export type CaretakerPermissionLevel = "full" | "operations_only";

export interface CaretakerInvite {
  id: string;
  /** Email address the invite was sent to */
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  /** Which of the owner's properties this caretaker can manage */
  propertyIds: string[];
  /** Property names for display (resolved by backend) */
  propertyNames?: string[];
  /** Access level granted at invite time */
  permissionLevel: CaretakerPermissionLevel;
  status: "pending" | "accepted" | "expired" | "revoked";
  token: string;
  /** Owner (landlord) who sent the invite */
  ownerId: string;
  createdAt: string;
  /** Expires 7 days after creation */
  expiresAt: string;
  acceptedAt?: string;
}

export interface CreateCaretakerInviteRequest {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  propertyIds: string[];
  permissionLevel: CaretakerPermissionLevel;
}

/** Active caretaker user (already onboarded) */
export interface ActiveCaretaker {
  id: string;
  userId: string;
  email: string;
  name: string;
  phone?: string;
  propertyIds: string[];
  propertyNames?: string[];
  permissionLevel: CaretakerPermissionLevel;
  /** When their access was granted */
  createdAt: string;
  /** null = active; set when landlord deactivates */
  deactivatedAt?: string;
  lastLoginAt?: string;
}

// ── Invite endpoints ──────────────────────────────────────────────────────────

/** List all caretaker invites sent by the current owner */
export async function listCaretakerInvites(): Promise<CaretakerInvite[]> {
  return apiGet<CaretakerInvite[]>("/caretaker-invites");
}

/** Send a caretaker invitation */
export async function createCaretakerInvite(
  data: CreateCaretakerInviteRequest,
): Promise<CaretakerInvite> {
  return apiPost<CaretakerInvite>("/caretaker-invites", data);
}

/** Revoke an invite (prevents acceptance if still pending) */
export async function revokeCaretakerInvite(id: string): Promise<void> {
  return apiDelete(`/caretaker-invites/${id}`);
}

/** Resend the invite email */
export async function resendCaretakerInvite(id: string): Promise<void> {
  return apiPost(`/caretaker-invites/${id}/resend`, {});
}

// ── Active caretaker management ────────────────────────────────────────────────

/** List all active caretakers for the current owner */
export async function listCaretakers(): Promise<ActiveCaretaker[]> {
  return apiGet<ActiveCaretaker[]>("/caretakers");
}

/**
 * Update a caretaker's property scope or permission level.
 * Note: propertyIds must be a subset of the owner's own properties.
 */
export async function updateCaretaker(
  id: string,
  data: Partial<Pick<ActiveCaretaker, "propertyIds" | "permissionLevel">>,
): Promise<ActiveCaretaker> {
  return apiPatch<ActiveCaretaker>(`/caretakers/${id}`, data);
}

/**
 * Deactivate a caretaker — their account is preserved for audit purposes
 * but login is blocked immediately (session invalidated by backend).
 * The owner can re-invite them later if needed.
 */
export async function deactivateCaretaker(id: string): Promise<void> {
  return apiPost(`/caretakers/${id}/deactivate`, {});
}

// ── Public onboarding (no auth required) ──────────────────────────────────────

export interface CaretakerOnboardingDetails {
  token: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  expiresAt: string;
  /** Who invited them */
  ownerName: string;
  /** Names of the properties they are being given access to */
  propertyNames: string[];
  permissionLevel: CaretakerPermissionLevel;
}

export interface CompleteCaretakerOnboardingRequest {
  firstName: string;
  lastName: string;
  phone?: string;
}

export interface CompleteCaretakerOnboardingResponse {
  message: string;
}

export async function getCaretakerOnboarding(
  token: string,
): Promise<CaretakerOnboardingDetails> {
  return apiGet<CaretakerOnboardingDetails>(`/caretaker-invites/onboarding/${token}`);
}

export async function completeCaretakerOnboarding(
  token: string,
  data: CompleteCaretakerOnboardingRequest,
): Promise<CompleteCaretakerOnboardingResponse> {
  return apiPost<CompleteCaretakerOnboardingResponse>(
    `/caretaker-invites/onboarding/${token}/complete`,
    data,
  );
}
