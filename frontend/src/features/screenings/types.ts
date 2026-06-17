export interface ChecklistItem {
  key: string;
  label: string;
  checked: boolean;
  notes: string | null;
}

export interface TenantScreening {
  id: string;
  organisationId: string;
  unitId: string | null;
  tenantId: string | null;
  applicantName: string;
  applicantPhone: string | null;
  applicantEmail: string | null;
  status: "pending" | "approved" | "rejected";
  checklist: ChecklistItem[];
  notes: string | null;
  decisionNotes: string | null;
  createdById: string | null;
  decidedById: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
