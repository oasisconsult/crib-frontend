/**
 * API service for the tenant onboarding payment flow.
 *
 * All endpoints use the public token-authenticated path:
 *   /api/v1/tenants/onboarding/{token}/...
 *
 * No Authorization header is needed — the invite token is the credential.
 * We use the same apiGet/apiPost helpers but the BFF proxy will not inject
 * auth for these public routes (backend accepts them without JWT).
 */

import { apiGet, apiPost } from "./client";
import type {
  AgreementPreview,
  OnboardingFlowStatus,
  OnboardingPaymentItem,
  OnboardingPaymentResult,
  TermsAcceptResult,
} from "@/types/onboarding";

const base = (token: string) => `/tenants/onboarding/${token}`;

export const onboardingFlowApi = {
  /** Full state — used on every mount to resume the wizard from the correct step. */
  getFlowStatus: (token: string) =>
    apiGet<OnboardingFlowStatus>(`${base(token)}/flow`),

  /** Generate (or return cached) agreement preview snapshot. */
  previewAgreement: (token: string) =>
    apiPost<AgreementPreview>(`${base(token)}/preview`),

  /** Record explicit terms acceptance. */
  acceptTerms: (token: string, accepted: boolean) =>
    apiPost<TermsAcceptResult>(`${base(token)}/accept-terms`, { accepted }),

  /** Submit onboarding payments (deposit + advance rent). */
  submitPayments: (token: string, payments: OnboardingPaymentItem[]) =>
    apiPost<OnboardingPaymentResult>(`${base(token)}/payment`, { payments }),

  /** Confirm a specific onboarding payment (manager or webhook). */
  confirmPayment: (token: string, paymentId: string) =>
    apiPost<OnboardingPaymentResult>(`${base(token)}/payment/${paymentId}/confirm`),

  /** Sign final agreement — auto-activates the lease on success. */
  signAgreement: (token: string, signatureDataUrl: string) =>
    apiPost<Record<string, unknown>>(`${base(token)}/sign`, { signatureDataUrl }),
};
