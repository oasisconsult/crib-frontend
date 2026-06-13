export type RentIncreaseStatus =
  | "pending_ack"
  | "acknowledged"
  | "applied"
  | "withdrawn";

export interface RentIncrease {
  id: string;
  organisationId: string;
  leaseId: string;
  propertyId: string | null;
  unitId: string | null;
  tenantId: string | null;
  issuedBy: string;
  status: RentIncreaseStatus;
  currentRent: number;
  newRent: number;
  increasePct: number;
  effectiveDate: string;
  issuedAt: string;
  acknowledgedAt: string | null;
  appliedAt: string | null;
  withdrawnAt: string | null;
  noticePdfUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RentIncreaseCreate {
  newRent: number;
  effectiveDate: string;
  notes?: string | null;
}

export interface RentIncreaseWithdraw {
  reason?: string | null;
}

export interface RentIncreaseListOut {
  data: RentIncrease[];
  total: number;
}

export const STATUS_LABELS: Record<RentIncreaseStatus, string> = {
  pending_ack:  "Pending Acknowledgement",
  acknowledged: "Acknowledged",
  applied:      "Applied",
  withdrawn:    "Withdrawn",
};

export const STATUS_COLORS: Record<RentIncreaseStatus, string> = {
  pending_ack:  "bg-amber-100 text-amber-800",
  acknowledged: "bg-blue-100 text-blue-800",
  applied:      "bg-green-100 text-green-800",
  withdrawn:    "bg-gray-100 text-gray-600",
};
