/**
 * Crib – Workflow State Machines
 * All states, events, and transition maps for every domain workflow.
 */

// ─── Tenant Onboarding ────────────────────────────────────────────────────────
export type OnboardingState =
  | "invited"
  | "started"
  | "submitted"
  | "approved"
  | "activated"
  | "rejected";

export type OnboardingEvent =
  | "INVITE_SENT"
  | "ONBOARDING_STARTED"
  | "ONBOARDING_COMPLETED"
  | "TENANT_APPROVED"
  | "TENANT_REJECTED"
  | "TENANT_ACTIVATED";

export const ONBOARDING_TRANSITIONS: Record<
  OnboardingState,
  Partial<Record<OnboardingEvent, OnboardingState>>
> = {
  invited: { ONBOARDING_STARTED: "started" },
  started: { ONBOARDING_COMPLETED: "submitted" },
  submitted: { TENANT_APPROVED: "approved", TENANT_REJECTED: "rejected" },
  approved: { TENANT_ACTIVATED: "activated" },
  activated: {},
  rejected: { INVITE_SENT: "invited" }, // can re-invite
};

// ─── Lease Lifecycle ──────────────────────────────────────────────────────────
export type LeaseState =
  | "draft"
  // Onboarding payment flow states
  | "onboarding_started"
  | "agreement_previewed"
  | "terms_accepted"
  | "payment_pending"
  | "payment_secured"
  | "agreement_signed"
  // Live states
  | "active"
  | "expired"
  | "terminated";

export type LeaseEvent =
  | "LEASE_CREATED"
  | "LEASE_SENT"
  | "LEASE_SIGNED"
  | "LEASE_ACTIVATED"
  | "NOTICE_GIVEN"
  | "LEASE_TERMINATED"
  | "LEASE_CLOSED"
  | "LEASE_RENEWED"
  // Onboarding events
  | "TENANT_OPENED_LINK"
  | "AGREEMENT_PREVIEWED"
  | "TERMS_ACCEPTED"
  | "PAYMENT_SUBMITTED"
  | "PAYMENT_CONFIRMED"
  | "AGREEMENT_SIGNED";

export const LEASE_TRANSITIONS: Record<
  LeaseState,
  Partial<Record<LeaseEvent, LeaseState>>
> = {
  draft:               { TENANT_OPENED_LINK: "onboarding_started" },
  onboarding_started:  { AGREEMENT_PREVIEWED: "agreement_previewed" },
  agreement_previewed: { TERMS_ACCEPTED: "terms_accepted" },
  terms_accepted:      { PAYMENT_SUBMITTED: "payment_pending" },
  payment_pending:     { PAYMENT_CONFIRMED: "payment_secured" },
  payment_secured:     { AGREEMENT_SIGNED: "agreement_signed" },
  agreement_signed:    { LEASE_ACTIVATED: "active" },
  active:              { NOTICE_GIVEN: "active", LEASE_TERMINATED: "terminated" },
  expired:             {},
  terminated:          {},
};

export const LEASE_STATE_DISPLAY: Record<LeaseState, StateDisplayConfig> = {
  draft:               { label: "Draft",              color: "text-slate-600",   bgColor: "bg-slate-100"   },
  onboarding_started:  { label: "Onboarding",         color: "text-teal-700",  bgColor: "bg-teal-100"  },
  agreement_previewed: { label: "Preview Sent",       color: "text-teal-700",    bgColor: "bg-teal-100"    },
  terms_accepted:      { label: "Terms Accepted",     color: "text-teal-700",  bgColor: "bg-teal-100"  },
  payment_pending:     { label: "Payment Pending",    color: "text-amber-700",   bgColor: "bg-amber-100"   },
  payment_secured:     { label: "Payment Secured",    color: "text-emerald-700", bgColor: "bg-emerald-100" },
  agreement_signed:    { label: "Agreement Signed",   color: "text-teal-700",    bgColor: "bg-teal-100"    },
  active:              { label: "Active",              color: "text-emerald-700", bgColor: "bg-emerald-100" },
  expired:             { label: "Expired",             color: "text-gray-600",    bgColor: "bg-gray-100"    },
  terminated:          { label: "Terminated",          color: "text-red-700",     bgColor: "bg-red-100"     },
};

// ─── Rent / Billing ───────────────────────────────────────────────────────────
export type RentState = "scheduled" | "due" | "overdue" | "settled" | "waived";

export type RentEvent =
  | "RENT_GENERATED"
  | "RENT_DUE"
  | "RENT_OVERDUE"
  | "RENT_PAID"
  | "RENT_WAIVED";

export const RENT_TRANSITIONS: Record<
  RentState,
  Partial<Record<RentEvent, RentState>>
> = {
  scheduled: { RENT_DUE: "due" },
  due: { RENT_PAID: "settled", RENT_OVERDUE: "overdue", RENT_WAIVED: "waived" },
  overdue: { RENT_PAID: "settled", RENT_WAIVED: "waived" },
  settled: {},
  waived: {},
};

// ─── Payment ──────────────────────────────────────────────────────────────────
export type PaymentState =
  // v4 happy path
  | "initiated"
  | "predicted"
  | "routed"
  | "pending"        // shared: awaiting provider confirmation
  | "reconciled"
  | "allocated"
  | "completed"      // v4 terminal success
  // v4 failure paths
  | "predicted_failure"
  | "retry_scheduled"
  | "permanently_failed"
  // legacy (kept for backward compat)
  | "confirmed"
  | "failed"
  | "refunded";

export type PaymentEvent =
  | "PAYMENT_RECORDED"
  | "PAYMENT_PREDICTED"
  | "PAYMENT_ROUTED"
  | "PAYMENT_PROCESSING"
  | "PAYMENT_CONFIRMED"
  | "PAYMENT_FAILED"
  | "PAYMENT_RECONCILED"
  | "PAYMENT_ALLOCATED"
  | "PAYMENT_COMPLETED"
  | "PAYMENT_RETRY_SCHEDULED"
  | "PAYMENT_PERMANENTLY_FAILED"
  | "PAYMENT_PREDICTION_BLOCKED"
  | "PAYMENT_REFUNDED";

export const PAYMENT_TRANSITIONS: Record<
  PaymentState,
  Partial<Record<PaymentEvent, PaymentState>>
> = {
  initiated:          { PAYMENT_PREDICTED: "predicted", PAYMENT_ROUTED: "routed", PAYMENT_PROCESSING: "pending", PAYMENT_PREDICTION_BLOCKED: "predicted_failure" },
  predicted:          { PAYMENT_ROUTED: "routed", PAYMENT_PROCESSING: "pending", PAYMENT_PREDICTION_BLOCKED: "predicted_failure" },
  routed:             { PAYMENT_PROCESSING: "pending", PAYMENT_RETRY_SCHEDULED: "retry_scheduled" },
  pending:            { PAYMENT_RECONCILED: "reconciled", PAYMENT_RETRY_SCHEDULED: "retry_scheduled", PAYMENT_PERMANENTLY_FAILED: "permanently_failed", PAYMENT_CONFIRMED: "confirmed", PAYMENT_COMPLETED: "completed" },
  reconciled:         { PAYMENT_ALLOCATED: "allocated", PAYMENT_PERMANENTLY_FAILED: "permanently_failed" },
  allocated:          { PAYMENT_COMPLETED: "completed", PAYMENT_PERMANENTLY_FAILED: "permanently_failed" },
  completed:          { PAYMENT_REFUNDED: "refunded" },
  predicted_failure:  { PAYMENT_ROUTED: "routed" },
  retry_scheduled:    { PAYMENT_ROUTED: "routed", PAYMENT_PROCESSING: "pending", PAYMENT_PERMANENTLY_FAILED: "permanently_failed" },
  permanently_failed: {},
  // legacy
  confirmed:          { PAYMENT_REFUNDED: "refunded", PAYMENT_COMPLETED: "completed" },
  failed:             { PAYMENT_RETRY_SCHEDULED: "retry_scheduled", PAYMENT_PERMANENTLY_FAILED: "permanently_failed" },
  refunded:           {},
};

// ─── Late Fee ─────────────────────────────────────────────────────────────────
export type LateFeeState = "eligible" | "applied" | "paid" | "waived";

export type LateFeeEvent =
  | "LATE_FEE_TRIGGERED"
  | "LATE_FEE_APPLIED"
  | "LATE_FEE_PAID"
  | "LATE_FEE_WAIVED";

export const LATE_FEE_TRANSITIONS: Record<
  LateFeeState,
  Partial<Record<LateFeeEvent, LateFeeState>>
> = {
  eligible: { LATE_FEE_APPLIED: "applied" },
  applied: { LATE_FEE_PAID: "paid", LATE_FEE_WAIVED: "waived" },
  paid: {},
  waived: {},
};

// ─── Inspection ───────────────────────────────────────────────────────────────
export type InspectionState =
  | "scheduled"
  | "in_progress"
  | "completed"
  | "approved"
  | "failed"
  | "cancelled";

export type InspectionEvent =
  | "INSPECTION_CREATED"
  | "INSPECTION_STARTED"
  | "INSPECTION_COMPLETED"
  | "INSPECTION_APPROVED"
  | "INSPECTION_FAILED"
  | "INSPECTION_CANCELLED";

export const INSPECTION_TRANSITIONS: Record<
  InspectionState,
  Partial<Record<InspectionEvent, InspectionState>>
> = {
  scheduled: {
    INSPECTION_STARTED: "in_progress",
    INSPECTION_CANCELLED: "cancelled",
  },
  in_progress: {
    INSPECTION_COMPLETED: "completed",
    INSPECTION_FAILED: "failed",
  },
  completed: { INSPECTION_APPROVED: "approved", INSPECTION_FAILED: "failed" },
  approved: {},
  failed: { INSPECTION_CREATED: "scheduled" }, // reschedule
  cancelled: { INSPECTION_CREATED: "scheduled" },
};

// ─── Vacating ─────────────────────────────────────────────────────────────────
export type VacatingState =
  | "notice_given"
  | "scheduled"
  | "inspected"
  | "settled"
  | "closed";

export type VacatingEvent =
  | "NOTICE_SUBMITTED"
  | "MOVE_OUT_SCHEDULED"
  | "MOVE_OUT_INSPECTED"
  | "DEPOSIT_SETTLED"
  | "VACATING_CLOSED";

export const VACATING_TRANSITIONS: Record<
  VacatingState,
  Partial<Record<VacatingEvent, VacatingState>>
> = {
  notice_given: { MOVE_OUT_SCHEDULED: "scheduled" },
  scheduled: { MOVE_OUT_INSPECTED: "inspected" },
  inspected: { DEPOSIT_SETTLED: "settled" },
  settled: { VACATING_CLOSED: "closed" },
  closed: {},
};

// ─── Document ─────────────────────────────────────────────────────────────────
export type DocumentState =
  | "generated"
  | "sent"
  | "viewed"
  | "accepted"
  | "rejected"
  | "archived";

export type DocumentEvent =
  | "DOCUMENT_GENERATED"
  | "DOCUMENT_SENT"
  | "DOCUMENT_VIEWED"
  | "DOCUMENT_ACCEPTED"
  | "DOCUMENT_REJECTED"
  | "DOCUMENT_ARCHIVED";

export const DOCUMENT_TRANSITIONS: Record<
  DocumentState,
  Partial<Record<DocumentEvent, DocumentState>>
> = {
  generated: { DOCUMENT_SENT: "sent" },
  sent: { DOCUMENT_VIEWED: "viewed" },
  viewed: { DOCUMENT_ACCEPTED: "accepted", DOCUMENT_REJECTED: "rejected" },
  accepted: { DOCUMENT_ARCHIVED: "archived" },
  rejected: { DOCUMENT_SENT: "sent" }, // resend
  archived: {},
};

// ─── Notification ─────────────────────────────────────────────────────────────
export type NotificationState =
  | "queued"
  | "sent"
  | "delivered"
  | "read"
  | "failed";

export type NotificationEvent =
  | "MESSAGE_QUEUED"
  | "MESSAGE_SENT"
  | "MESSAGE_DELIVERED"
  | "MESSAGE_READ"
  | "MESSAGE_FAILED";

export const NOTIFICATION_TRANSITIONS: Record<
  NotificationState,
  Partial<Record<NotificationEvent, NotificationState>>
> = {
  queued: { MESSAGE_SENT: "sent", MESSAGE_FAILED: "failed" },
  sent: { MESSAGE_DELIVERED: "delivered", MESSAGE_FAILED: "failed" },
  delivered: { MESSAGE_READ: "read" },
  read: {},
  failed: { MESSAGE_QUEUED: "queued" }, // retry
};

// ─── Maintenance ──────────────────────────────────────────────────────────────
export type MaintenanceState =
  | "reported"
  | "assigned"
  | "in_progress"
  | "resolved"
  | "closed"
  | "cancelled";

export type MaintenanceEvent =
  | "ISSUE_CREATED"
  | "ISSUE_ASSIGNED"
  | "ISSUE_STARTED"
  | "ISSUE_RESOLVED"
  | "ISSUE_CLOSED"
  | "ISSUE_CANCELLED";

export const MAINTENANCE_TRANSITIONS: Record<
  MaintenanceState,
  Partial<Record<MaintenanceEvent, MaintenanceState>>
> = {
  reported: { ISSUE_ASSIGNED: "assigned", ISSUE_CANCELLED: "cancelled" },
  assigned: { ISSUE_STARTED: "in_progress", ISSUE_CANCELLED: "cancelled" },
  in_progress: { ISSUE_RESOLVED: "resolved", ISSUE_CANCELLED: "cancelled" },
  resolved: { ISSUE_CLOSED: "closed" },
  closed: {},
  cancelled: {},
};

// ─── Generic transition helper ────────────────────────────────────────────────
export function canTransition<S extends string, E extends string>(
  transitions: Record<S, Partial<Record<E, S>>>,
  currentState: S,
  event: E,
): boolean {
  return event in (transitions[currentState] ?? {});
}

export function applyTransition<S extends string, E extends string>(
  transitions: Record<S, Partial<Record<E, S>>>,
  currentState: S,
  event: E,
): S {
  const next = transitions[currentState]?.[event];
  if (!next) {
    throw new Error(
      `Invalid transition: ${event} from state ${currentState}`,
    );
  }
  return next;
}

// ─── State display metadata ───────────────────────────────────────────────────
export type StateDisplayConfig = {
  label: string;
  color: string;
  bgColor: string;
  description?: string;
};

export const ONBOARDING_STATE_DISPLAY: Record<OnboardingState, StateDisplayConfig> = {
  invited: { label: "Invited", color: "text-slate-600", bgColor: "bg-slate-100" },
  started: { label: "In Progress", color: "text-teal-700", bgColor: "bg-teal-100" },
  submitted: { label: "Submitted", color: "text-amber-700", bgColor: "bg-amber-100" },
  approved: { label: "Approved", color: "text-emerald-700", bgColor: "bg-emerald-100" },
  activated: { label: "Active Tenant", color: "text-teal-700", bgColor: "bg-teal-100" },
  rejected: { label: "Rejected", color: "text-red-700", bgColor: "bg-red-100" },
};

export const PAYMENT_STATE_DISPLAY: Record<PaymentState, StateDisplayConfig> = {
  // v4 happy path
  initiated:          { label: "Initiated",         color: "text-slate-600",   bgColor: "bg-slate-100"   },
  predicted:          { label: "Analysed",           color: "text-teal-700",  bgColor: "bg-teal-100"  },
  routed:             { label: "Routed",             color: "text-teal-700",    bgColor: "bg-teal-100"    },
  pending:            { label: "Processing",         color: "text-amber-700",   bgColor: "bg-amber-100"   },
  reconciled:         { label: "Reconciled",         color: "text-teal-700",    bgColor: "bg-teal-100"    },
  allocated:          { label: "Allocated",          color: "text-teal-700",  bgColor: "bg-teal-100"  },
  completed:          { label: "Completed",          color: "text-emerald-700", bgColor: "bg-emerald-100" },
  // v4 failure paths
  predicted_failure:  { label: "Blocked",            color: "text-orange-700",  bgColor: "bg-orange-100"  },
  retry_scheduled:    { label: "Retry Scheduled",    color: "text-amber-700",   bgColor: "bg-amber-100"   },
  permanently_failed: { label: "Failed",             color: "text-red-700",     bgColor: "bg-red-100"     },
  // legacy
  confirmed:          { label: "Confirmed",          color: "text-emerald-700", bgColor: "bg-emerald-100" },
  failed:             { label: "Failed",             color: "text-red-700",     bgColor: "bg-red-100"     },
  refunded:           { label: "Refunded",           color: "text-orange-700",  bgColor: "bg-orange-100"  },
};

export const RENT_STATE_DISPLAY: Record<RentState, StateDisplayConfig> = {
  scheduled: { label: "Scheduled", color: "text-slate-600", bgColor: "bg-slate-100" },
  due: { label: "Due", color: "text-amber-700", bgColor: "bg-amber-100" },
  overdue: { label: "Overdue", color: "text-red-700", bgColor: "bg-red-100" },
  settled: { label: "Settled", color: "text-emerald-700", bgColor: "bg-emerald-100" },
  waived: { label: "Waived", color: "text-gray-600", bgColor: "bg-gray-100" },
};

export const INSPECTION_STATE_DISPLAY: Record<InspectionState, StateDisplayConfig> = {
  scheduled: { label: "Scheduled", color: "text-teal-700", bgColor: "bg-teal-100" },
  in_progress: { label: "In Progress", color: "text-amber-700", bgColor: "bg-amber-100" },
  completed: { label: "Completed", color: "text-emerald-700", bgColor: "bg-emerald-100" },
  approved: { label: "Approved", color: "text-teal-700", bgColor: "bg-teal-100" },
  failed: { label: "Failed", color: "text-red-700", bgColor: "bg-red-100" },
  cancelled: { label: "Cancelled", color: "text-gray-600", bgColor: "bg-gray-100" },
};

export const MAINTENANCE_STATE_DISPLAY: Record<MaintenanceState, StateDisplayConfig> = {
  reported: { label: "Reported", color: "text-slate-600", bgColor: "bg-slate-100" },
  assigned: { label: "Assigned", color: "text-teal-700", bgColor: "bg-teal-100" },
  in_progress: { label: "In Progress", color: "text-amber-700", bgColor: "bg-amber-100" },
  resolved: { label: "Resolved", color: "text-emerald-700", bgColor: "bg-emerald-100" },
  closed: { label: "Closed", color: "text-gray-600", bgColor: "bg-gray-100" },
  cancelled: { label: "Cancelled", color: "text-gray-600", bgColor: "bg-gray-100" },
};

export const NOTIFICATION_STATE_DISPLAY: Record<NotificationState, StateDisplayConfig> = {
  queued: { label: "Queued", color: "text-slate-600", bgColor: "bg-slate-100" },
  sent: { label: "Sent", color: "text-teal-700", bgColor: "bg-teal-100" },
  delivered: { label: "Delivered", color: "text-emerald-700", bgColor: "bg-emerald-100" },
  read: { label: "Read", color: "text-teal-700", bgColor: "bg-teal-100" },
  failed: { label: "Failed", color: "text-red-700", bgColor: "bg-red-100" },
};
