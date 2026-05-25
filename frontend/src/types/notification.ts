import type { NotificationState } from "./states";

export type NotificationChannel = "whatsapp" | "email" | "sms" | "in_app";
export type NotificationTrigger =
  | "rent_due"
  | "rent_overdue"
  | "lease_expiry"
  | "lease_activated"
  | "onboarding_invite"
  | "document_ready"
  | "inspection_scheduled"
  | "maintenance_update"
  | "payment_confirmed"
  | "payment_failed"
  | "late_fee_applied"
  | "deposit_received"
  | "notice_given"       // Tenant notice to vacate submitted
  | "lease_terminated"   // Lease terminated by manager
  | "custom";

export interface NotificationTemplate {
  id: string;
  name: string;
  trigger: NotificationTrigger;
  channel: NotificationChannel;
  subject?: string; // email only
  body: string;
  // Template variables: {{tenant_name}}, {{property_name}}, etc.
  variables: string[];
  isActive: boolean;
  landlordId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  id: string;
  state: NotificationState;
  channel: NotificationChannel;
  trigger: NotificationTrigger;
  templateId?: string;
  // Recipients
  tenantId?: string;
  landlordId: string;
  recipientName: string;
  recipientEmail?: string;
  recipientPhone?: string;
  // Content
  subject?: string;
  body: string;
  // Delivery
  queuedAt: string;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  failedAt?: string;
  failureReason?: string;
  retryCount: number;
  externalMessageId?: string;
  // Context
  propertyId?: string;
  leaseId?: string;
  paymentId?: string;
  createdAt: string;
}

export interface NotificationStats {
  total: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  deliveryRate: number;
  readRate: number;
  byChannel: Record<NotificationChannel, number>;
}
