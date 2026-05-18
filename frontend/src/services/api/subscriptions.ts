import { apiGet, apiPatch, apiPost } from "./client";

// ── Types ──────────────────────────────────────────────────────────────────

export type SubscriptionStatus =
  | "trialing" | "active" | "pending_payment" | "pending_verification"
  | "grace_period" | "past_due" | "suspended" | "cancelled" | "expired";

export type BillingCycle = "none" | "monthly" | "annual";
export type BillingCurrency = "UGX" | "USD";
export type PaymentMethod = "mtn_momo" | "airtel_money" | "bank_transfer" | "cash";

export interface SubscriptionPlan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  monthlyPriceUgx: number;
  annualPriceUgx: number;
  monthlyPriceUsdCents: number;
  annualPriceUsdCents: number;
  maxProperties: number;
  maxUnits: number;
  maxUsers: number;
  maxStorageMb: number;
  features: Record<string, boolean>;
  trialDays: number;
  isActive: boolean;
  displayOrder: number;
}

export interface OrganisationSubscription {
  id: string;
  organisationId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  billingCycle: BillingCycle;
  currency: BillingCurrency;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  gracePeriodUntil: string | null;
  nextInvoiceDate: string | null;
  autoRenew: boolean;
  cancelledAt: string | null;
  pricePaid: number | null;
  priceCurrency: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionUsage {
  propertiesUsed: number;
  propertiesLimit: number;
  propertiesPercent: number;
  unitsUsed: number;
  unitsLimit: number;
  unitsPercent: number;
  usersUsed: number;
  usersLimit: number;
  usersPercent: number;
  storageUsedMb: number;
  storageLimitMb: number;
  storagePercent: number;
}

export interface SubscriptionPayment {
  id: string;
  organisationId: string;
  subscriptionId: string;
  invoiceId: string | null;
  paymentMethod: PaymentMethod;
  amount: number;
  currency: string;
  transactionReference: string | null;
  phoneNumber: string | null;
  accountName: string | null;
  bankName: string | null;
  transferDate: string | null;
  proofFileKey: string | null;
  status: "pending" | "pending_verification" | "verified" | "rejected" | "refunded";
  submittedAt: string | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
  notes: string | null;
  createdAt: string;
}

export interface SubscriptionInvoice {
  id: string;
  organisationId: string;
  subscriptionId: string;
  invoiceNumber: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  currency: string;
  periodStart: string | null;
  periodEnd: string | null;
  dueDate: string | null;
  paidAt: string | null;
  status: "draft" | "issued" | "paid" | "void" | "overdue";
  lineItems: Array<Record<string, unknown>>;
  createdAt: string;
}

export interface BillingSettings {
  vatRatePercent: number;
  trialDays: number;
  gracePeriodDays: number;
  invoicePrefix: string;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankBranch: string;
  bankSwiftCode: string;
  bankSortCode: string;
  mtnNumber: string;
  mtnName: string;
  airtelNumber: string;
  airtelName: string;
  cashInstructions: string;
}

export interface SubmitPaymentPayload {
  planId: string;
  billingCycle: BillingCycle;
  currency: BillingCurrency;
  paymentMethod: PaymentMethod;
  amount: number;
  phoneNumber?: string;
  accountName?: string;
  transactionReference?: string;
  bankName?: string;
  transferDate?: string;
  proofFileKey?: string;
  notes?: string;
}

// ── API calls ──────────────────────────────────────────────────────────────

export const subscriptionsApi = {
  // Plans
  getPlans: () => apiGet<SubscriptionPlan[]>("/subscriptions/plans"),

  // Current subscription
  getCurrent: () => apiGet<OrganisationSubscription>("/subscriptions/current"),
  getUsage: () => apiGet<SubscriptionUsage>("/subscriptions/usage"),

  // Plan management
  selectPlan: (planId: string, billingCycle: BillingCycle, currency: BillingCurrency) =>
    apiPost<OrganisationSubscription>("/subscriptions/select-plan", { planId, billingCycle, currency }),

  cancel: (reason?: string) =>
    apiPost<OrganisationSubscription>("/subscriptions/cancel", { reason }),

  getAuditLog: (limit = 50, offset = 0) =>
    apiGet<unknown[]>(`/subscriptions/audit-log?limit=${limit}&offset=${offset}`),

  // Payments
  submitPayment: (payload: SubmitPaymentPayload) =>
    apiPost<SubscriptionPayment>("/billing/payments/submit", payload),

  getPaymentHistory: (limit = 20, offset = 0) =>
    apiGet<{ data: SubscriptionPayment[]; total: number; hasNext: boolean }>(
      `/billing/payments/history?limit=${limit}&offset=${offset}`
    ),

  // Invoices
  getInvoices: (limit = 20, offset = 0) =>
    apiGet<{ data: SubscriptionInvoice[]; total: number; hasNext: boolean }>(
      `/invoices?limit=${limit}&offset=${offset}`
    ),

  getInvoice: (id: string) => apiGet<SubscriptionInvoice>(`/invoices/${id}`),

  // Billing settings (public — for payment form instructions)
  getBillingSettings: () => apiGet<BillingSettings>("/billing/settings"),
};

// ── Admin API calls ────────────────────────────────────────────────────────

export const adminBillingApi = {
  getPlans: () => apiGet<SubscriptionPlan[]>("/admin/billing/plans"),

  updatePlan: (planId: string, updates: Partial<SubscriptionPlan>) =>
    apiPatch<SubscriptionPlan>(`/admin/billing/plans/${planId}`, updates),

  getSubscriptions: (params?: { status?: string; planSlug?: string; limit?: number; offset?: number }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.planSlug) q.set("plan_slug", params.planSlug);
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.offset) q.set("offset", String(params.offset));
    return apiGet<{ data: OrganisationSubscription[]; total: number }>(`/admin/billing/subscriptions?${q}`);
  },

  extendSubscription: (subscriptionId: string, days: number, reason?: string) =>
    apiPost<OrganisationSubscription>(`/admin/billing/subscriptions/${subscriptionId}/extend`, { days, reason }),

  suspendSubscription: (subscriptionId: string, reason: string) =>
    apiPost<OrganisationSubscription>(`/admin/billing/subscriptions/${subscriptionId}/suspend?reason=${encodeURIComponent(reason)}`, {}),

  getPendingPayments: (limit = 50, offset = 0) =>
    apiGet<{ data: SubscriptionPayment[]; total: number }>(
      `/admin/billing/payments/pending?limit=${limit}&offset=${offset}`
    ),

  verifyPayment: (paymentId: string, notes?: string) =>
    apiPost<SubscriptionPayment>(`/admin/billing/payments/${paymentId}/verify`, { notes }),

  rejectPayment: (paymentId: string, reason: string) =>
    apiPost<SubscriptionPayment>(`/admin/billing/payments/${paymentId}/reject`, { reason }),

  getBillingSettings: () => apiGet<BillingSettings>("/admin/billing/settings"),

  updateBillingSettings: (updates: Partial<BillingSettings>) =>
    apiPatch<BillingSettings>("/admin/billing/settings", updates),

  getAnalytics: () => apiGet<Record<string, unknown>>("/admin/billing/analytics"),
};
