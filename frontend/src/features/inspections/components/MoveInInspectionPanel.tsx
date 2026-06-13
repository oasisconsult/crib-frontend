"use client";

import { useRouter } from "next/navigation";
import {
  ClipboardList, ExternalLink, Plus,
  CheckCircle2, Clock, AlertCircle, Loader2, FileDown, PenLine,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useInspections } from "@/hooks/useInspections";
import { formatDate } from "@/utils/formatters";
import type { Inspection } from "@/types";

interface Props {
  leaseId: string;
  propertyId: string;
  unitId?: string;
  leaseStatus: string;
}

const SCHEDULABLE_STATES = ["pending", "onboarding", "active"];

const STATE_ICON: Record<string, React.ElementType> = {
  scheduled:   Clock,
  in_progress: Clock,
  completed:   CheckCircle2,
  approved:    CheckCircle2,
  failed:      AlertCircle,
  cancelled:   AlertCircle,
};

const STATE_COLORS: Record<string, string> = {
  scheduled:   "bg-blue-100 text-blue-800",
  in_progress: "bg-amber-100 text-amber-800",
  completed:   "bg-green-100 text-green-800",
  approved:    "bg-emerald-100 text-emerald-800",
  failed:      "bg-red-100 text-red-800",
  cancelled:   "bg-gray-100 text-gray-600",
};

const CONDITION_COLORS: Record<string, string> = {
  excellent: "text-emerald-700",
  good:      "text-green-700",
  fair:      "text-amber-700",
  poor:      "text-red-700",
};

function InspectionCard({ inspection }: { inspection: Inspection }) {
  const router = useRouter();
  const Icon = STATE_ICON[inspection.state] ?? Clock;
  const completedItems = inspection.checklist.filter((c: { condition: string | null }) => c.condition).length;
  const totalItems = inspection.checklist.length;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <Badge className={`text-[10px] px-1.5 py-0 capitalize ${STATE_COLORS[inspection.state] ?? "bg-gray-100 text-gray-600"}`}>
              {inspection.state.replace(/_/g, " ")}
            </Badge>
          </div>
          <p className="text-sm font-medium">
            Scheduled: {formatDate(inspection.scheduledDate)}
            {inspection.scheduledTimeSlot && (
              <span className="text-muted-foreground"> · {inspection.scheduledTimeSlot}</span>
            )}
          </p>
          {inspection.inspectorName && (
            <p className="text-xs text-muted-foreground">Inspector: {inspection.inspectorName}</p>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs shrink-0"
          onClick={() => router.push(`/inspections/${inspection.id}`)}
        >
          <ExternalLink className="h-3 w-3 mr-1" />
          View
        </Button>
      </div>

      {totalItems > 0 && (
        <p className="text-xs text-muted-foreground">
          Checklist: {completedItems}/{totalItems} items assessed
        </p>
      )}

      {inspection.overallCondition && (
        <p className={`text-xs font-semibold capitalize ${CONDITION_COLORS[inspection.overallCondition] ?? ""}`}>
          Overall: {inspection.overallCondition}
        </p>
      )}

      {inspection.summary && (
        <p className="text-xs text-muted-foreground line-clamp-2 border-l-2 border-muted pl-2">
          {inspection.summary}
        </p>
      )}

      {/* Photos count */}
      {inspection.photoUrls.length > 0 && (
        <p className="text-[10px] text-muted-foreground">
          {inspection.photoUrls.length} photo{inspection.photoUrls.length !== 1 ? "s" : ""}
        </p>
      )}

      {/* Signature status chips */}
      {(inspection.landlordSignedAt || inspection.tenantSignedAt) && (
        <div className="flex flex-wrap gap-1.5">
          {inspection.landlordSignedAt && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-medium">
              <PenLine className="h-2.5 w-2.5" />
              Landlord signed
            </span>
          )}
          {inspection.tenantSignedAt && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-medium">
              <PenLine className="h-2.5 w-2.5" />
              Tenant signed
            </span>
          )}
          {inspection.landlordSignedAt && !inspection.tenantSignedAt && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px] font-medium">
              <Clock className="h-2.5 w-2.5" />
              Awaiting tenant
            </span>
          )}
        </div>
      )}

      {/* Report download */}
      {(inspection as any).reportPdfUrl && (
        <a
          href={(inspection as any).reportPdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          <FileDown className="h-3 w-3" />
          {inspection.landlordSignedAt && inspection.tenantSignedAt ? "Sealed Report" : "Draft Report"}
        </a>
      )}
    </div>
  );
}

export function MoveInInspectionPanel({ leaseId, propertyId, unitId, leaseStatus }: Props) {
  const router = useRouter();
  const { data, isLoading } = useInspections({ leaseId, pageSize: 10 });

  const inspections = (data?.data ?? []).filter((i) => i.type === "move_in");
  const canSchedule = SCHEDULABLE_STATES.includes(leaseStatus);
  const hasActive = inspections.some((i) => !["cancelled", "failed"].includes(i.state));

  function handleSchedule() {
    const params = new URLSearchParams({ type: "move_in", leaseId, propertyId });
    if (unitId) params.set("unitId", unitId);
    router.push(`/inspections/new?${params.toString()}`);
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ClipboardList className="h-4 w-4" />
          Move-in Inspection
        </CardTitle>
        {canSchedule && !hasActive && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleSchedule}>
            <Plus className="h-3 w-3 mr-1" />
            Schedule
          </Button>
        )}
        {hasActive && inspections[0] && (
          <Badge className={`text-[10px] px-1.5 capitalize ${STATE_COLORS[inspections[0].state] ?? "bg-gray-100 text-gray-600"}`}>
            {inspections[0].state.replace(/_/g, " ")}
          </Badge>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {isLoading && (
          <div className="flex justify-center py-6 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {!isLoading && inspections.length === 0 && (
          <p className="text-sm text-muted-foreground py-2 text-center">
            No move-in inspection scheduled.
          </p>
        )}

        {inspections.map((insp) => (
          <InspectionCard key={insp.id} inspection={insp} />
        ))}
      </CardContent>
    </Card>
  );
}
