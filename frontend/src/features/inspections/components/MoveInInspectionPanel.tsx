"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList, CalendarDays, ExternalLink, Plus,
  CheckCircle2, Clock, AlertCircle, Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogBody, DialogFooter,
} from "@/components/ui/dialog";
import { useInspections, useCreateInspection } from "@/hooks/useInspections";
import { toast } from "@/store/useUIStore";
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

const DEFAULT_CHECKLIST = [
  { id: "cl-1", area: "Living Room",  description: "Walls, floor, windows, general condition", condition: null, notes: "", photoUrls: [], required: true },
  { id: "cl-2", area: "Kitchen",      description: "Appliances, fixtures, plumbing",            condition: null, notes: "", photoUrls: [], required: true },
  { id: "cl-3", area: "Bathroom(s)",  description: "Fixtures, fittings, water pressure",        condition: null, notes: "", photoUrls: [], required: true },
  { id: "cl-4", area: "Bedroom(s)",   description: "Walls, floor, windows, storage",            condition: null, notes: "", photoUrls: [], required: true },
  { id: "cl-5", area: "Exterior",     description: "Entry, compound, fencing, drainage",        condition: null, notes: "", photoUrls: [], required: false },
  { id: "cl-6", area: "Utilities",    description: "Electricity, water meter, gas if present",  condition: null, notes: "", photoUrls: [], required: false },
];

function InspectionCard({ inspection }: { inspection: Inspection }) {
  const router = useRouter();
  const Icon = STATE_ICON[inspection.state] ?? Clock;
  const stateLabel = inspection.state.replace(/_/g, " ");
  const completedItems = inspection.checklist.filter((c: { condition: string | null }) => c.condition).length;
  const totalItems = inspection.checklist.length;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <Badge className={`text-[10px] px-1.5 py-0 capitalize ${STATE_COLORS[inspection.state] ?? "bg-gray-100 text-gray-600"}`}>
              {stateLabel}
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
        <div className="text-xs text-muted-foreground">
          Checklist: {completedItems}/{totalItems} items assessed
        </div>
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

      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        {inspection.photoUrls.length > 0 && (
          <span>{inspection.photoUrls.length} photo{inspection.photoUrls.length !== 1 ? "s" : ""}</span>
        )}
        {inspection.tenantSignedAt && <span>· Tenant signed</span>}
        {inspection.landlordSignedAt && <span>· Landlord signed</span>}
      </div>
    </div>
  );
}

function ScheduleModal({
  open,
  onOpenChange,
  leaseId,
  propertyId,
  unitId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leaseId: string;
  propertyId: string;
  unitId?: string;
}) {
  const { mutate: create, isPending } = useCreateInspection();
  const [scheduledDate, setScheduledDate] = useState("");
  const [timeSlot, setTimeSlot] = useState("");
  const [inspectorName, setInspectorName] = useState("");

  function handleClose() {
    if (!isPending) {
      setScheduledDate("");
      setTimeSlot("");
      setInspectorName("");
      onOpenChange(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!scheduledDate) return;
    create(
      {
        type: "move_in",
        propertyId,
        unitId: unitId ?? "",
        landlordId: "",
        leaseId,
        scheduledDate,
        scheduledTimeSlot: timeSlot || undefined,
        inspectorName: inspectorName || undefined,
        checklist: DEFAULT_CHECKLIST,
        photoUrls: [],
        videoUrls: [],
        maintenanceIssueIds: [],
      },
      {
        onSuccess: () => {
          toast.success("Move-in inspection scheduled");
          handleClose();
        },
        onError: () => toast.error("Failed to schedule inspection"),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>Schedule Move-in Inspection</DialogTitle>
              <DialogDescription className="mt-1">
                A pre-tenancy inspection to record the property condition before the tenant moves in.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="mi-date">
                Scheduled date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="mi-date"
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mi-timeslot">Time slot (optional)</Label>
              <Input
                id="mi-timeslot"
                value={timeSlot}
                onChange={(e) => setTimeSlot(e.target.value)}
                placeholder="e.g. 10:00 – 12:00"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mi-inspector">Inspector name (optional)</Label>
              <Input
                id="mi-inspector"
                value={inspectorName}
                onChange={(e) => setInspectorName(e.target.value)}
                placeholder="e.g. John Mugisha"
              />
            </div>

            <div className="surface-brand">
              <p className="text-muted-foreground text-xs">
                A standard {DEFAULT_CHECKLIST.length}-item checklist will be created covering living areas,
                kitchen, bathroom, bedrooms, exterior and utilities. You can add photos and notes after scheduling.
              </p>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={isPending} disabled={!scheduledDate}>
              <CalendarDays className="h-4 w-4" />
              Schedule
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MoveInInspectionPanel({ leaseId, propertyId, unitId, leaseStatus }: Props) {
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const { data, isLoading } = useInspections({ leaseId, pageSize: 10 });

  const inspections = (data?.data ?? []).filter((i) => i.type === "move_in");
  const canSchedule = SCHEDULABLE_STATES.includes(leaseStatus);
  const hasActive = inspections.some((i) => !["cancelled", "failed"].includes(i.state));

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Move-in Inspection
          </CardTitle>
          {canSchedule && !hasActive && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => setScheduleOpen(true)}
            >
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

      <ScheduleModal
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        leaseId={leaseId}
        propertyId={propertyId}
        unitId={unitId}
      />
    </>
  );
}
