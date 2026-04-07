import { Badge } from "@/components/ui/badge";
import { cn } from "@/utils/cn";
import { capitalise } from "@/utils/formatters";
import type {
  LeaseState,
  OnboardingState,
  PaymentState,
  RentState,
  InspectionState,
  MaintenanceState,
  NotificationState,
} from "@/types/states";
import {
  LEASE_STATE_DISPLAY,
  ONBOARDING_STATE_DISPLAY,
  PAYMENT_STATE_DISPLAY,
  RENT_STATE_DISPLAY,
  INSPECTION_STATE_DISPLAY,
  MAINTENANCE_STATE_DISPLAY,
  NOTIFICATION_STATE_DISPLAY,
} from "@/types/states";

type AnyState =
  | LeaseState
  | OnboardingState
  | PaymentState
  | RentState
  | InspectionState
  | MaintenanceState
  | NotificationState;

type Domain =
  | "lease"
  | "onboarding"
  | "payment"
  | "rent"
  | "inspection"
  | "maintenance"
  | "notification";

interface StatusBadgeProps {
  state: AnyState;
  domain: Domain;
  className?: string;
}

const DOMAIN_MAP: Record<
  Domain,
  Record<string, { label: string; color: string; bgColor: string }>
> = {
  lease: LEASE_STATE_DISPLAY,
  onboarding: ONBOARDING_STATE_DISPLAY,
  payment: PAYMENT_STATE_DISPLAY,
  rent: RENT_STATE_DISPLAY,
  inspection: INSPECTION_STATE_DISPLAY,
  maintenance: MAINTENANCE_STATE_DISPLAY,
  notification: NOTIFICATION_STATE_DISPLAY,
};

export function StatusBadge({ state, domain, className }: StatusBadgeProps) {
  const config = DOMAIN_MAP[domain]?.[state];
  if (!config) {
    const label = state ? capitalise(state) : "Unknown";
    return (
      <Badge variant="slate" className={className}>
        {label}
      </Badge>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        config.bgColor,
        config.color,
        className,
      )}
      role="status"
      aria-label={`Status: ${config.label}`}
    >
      <span
        className="h-1.5 w-1.5 rounded-full bg-current opacity-75"
        aria-hidden="true"
      />
      {config.label}
    </span>
  );
}
