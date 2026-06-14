"use client";

import { useRouter } from "next/navigation";
import { ClipboardList, ExternalLink, Plus, CheckCircle2, Clock, AlertCircle, Loader2, FileDown, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useInspections } from "@/hooks/useInspections";
import { inspectionsApi } from "@/services/api/inspections";
import { formatDate } from "@/utils/formatters";
import type { Inspection } from "@/types";

interface Props {
  leaseId: string;
  propertyId: string;
  unitId?: string;
  leaseStatus: string;
}

const CONDITION_RANK: Record<string, number> = { excellent: 4, good: 3, fair: 2, poor: 1, damaged: 0 };
const STATE_COLORS: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-800",
  in_progress: "bg-amber-100 text-amber-800",
  completed: "bg-green-100 text-green-800",
  approved: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-600",
};

function DamageSummary({ checklist }: { checklist: any[] }) {
  const damaged = checklist.filter((item) => {
    const before = CONDITION_RANK[item.moveInCondition ?? item.move_in_condition ?? ""];
    const after = CONDITION_RANK[item.condition ?? ""];
    return before !== undefined && after !== undefined && after < before;
  });
  if (damaged.length === 0) return null;
  return (
    <div className="rounded border border-red-200 bg-red-50 p-3 mt-2 space-y-1.5">
      <p className="text-xs font-semibold text-red-700 flex items-center gap-1">
        <AlertTriangle className="h-3 w-3" /> {damaged.length} item(s) showing deterioration
      </p>
      {damaged.map((item, i) => (
        <div key={i} className="flex items-center justify-between text-xs">
          <span className="text-red-800 font-medium">{item.area} — {item.description}</span>
          <span className="flex items-center gap-1 text-red-600">
            <span className="capitalize">{item.moveInCondition ?? item.move_in_condition}</span>
            {" → "}
            <span className="capitalize font-semibold">{item.condition}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export function MoveOutInspectionPanel({ leaseId, propertyId, unitId, leaseStatus }: Props) {
  const router = useRouter();
  const { data, isLoading } = useInspections({ leaseId, pageSize: 10 } as any);
  const inspections = (data?.data ?? []).filter((i: any) => i.type === "move_out");
  const SCHEDULABLE_STATES = ["active", "expired", "terminated"];
  const canSchedule = SCHEDULABLE_STATES.includes(leaseStatus);
  const hasActive = inspections.some((i: any) => !["cancelled", "failed"].includes(i.state));

  function handleSchedule() {
    const params = new URLSearchParams({ type: "move_out", leaseId, propertyId });
    if (unitId) params.set("unitId", unitId);
    router.push(`/inspections/new?${params.toString()}`);
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ClipboardList className="h-4 w-4" />
          Move-Out Inspection
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
          <p className="text-sm text-muted-foreground py-2 text-center">No move-out inspection scheduled.</p>
        )}
        {inspections.map((insp: any) => (
          <div key={insp.id} className="rounded-lg border p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Badge className={`text-[10px] px-1.5 capitalize ${STATE_COLORS[insp.state] ?? "bg-gray-100 text-gray-600"}`}>
                    {insp.state.replace(/_/g, " ")}
                  </Badge>
                </div>
                <p className="text-sm font-medium">Scheduled: {formatDate(insp.scheduledDate)}</p>
                {insp.inspectorName && (
                  <p className="text-xs text-muted-foreground">Inspector: {insp.inspectorName}</p>
                )}
              </div>
              <Button size="sm" variant="ghost" className="h-7 text-xs shrink-0" onClick={() => router.push(`/inspections/${insp.id}`)}>
                <ExternalLink className="h-3 w-3 mr-1" />
                View
              </Button>
            </div>
            {(insp.landlordSignedAt || insp.tenantSignedAt) && (
              <div className="flex flex-wrap gap-1.5">
                {insp.landlordSignedAt && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-medium">
                    <CheckCircle2 className="h-2.5 w-2.5" /> Landlord signed
                  </span>
                )}
                {insp.tenantSignedAt && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-medium">
                    <CheckCircle2 className="h-2.5 w-2.5" /> Tenant signed
                  </span>
                )}
              </div>
            )}
            {insp.checklist && insp.checklist.length > 0 && (
              <DamageSummary checklist={insp.checklist} />
            )}
            {insp.reportPdfUrl && (
              <a href={inspectionsApi.reportDownloadUrl(insp.id)} target="_blank" rel="noopener noreferrer"
                 className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline">
                <FileDown className="h-3 w-3" />
                {insp.landlordSignedAt && insp.tenantSignedAt ? "Sealed Report" : "Draft Report"}
              </a>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
