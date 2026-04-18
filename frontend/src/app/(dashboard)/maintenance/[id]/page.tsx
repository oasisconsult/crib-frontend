"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Wrench,
  AlertTriangle,
  User,
  Building2,
  Home,
  Calendar,
  DollarSign,
  Edit,
  X,
  Save,
  CheckCircle,
  XCircle,
  Play,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageSkeleton } from "@/components/common/LoadingSkeleton";
import { formatDate, formatCurrency } from "@/utils/formatters";
import {
  useMaintenanceIssue,
  useUpdateMaintenanceIssue,
  useTransitionMaintenanceIssue,
} from "@/hooks/useInspections";
import { useProperty } from "@/hooks/useProperties";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/utils/cn";
import {
  MAINTENANCE_STATE_DISPLAY,
  MAINTENANCE_TRANSITIONS,
  type MaintenanceState,
  type MaintenanceEvent,
} from "@/types/states";
import type { MaintenanceIssue } from "@/types";

interface Props {
  params: Promise<{ id: string }>;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const CATEGORIES = [
  "plumbing", "electrical", "structural", "appliance", "pest", "security", "other",
] as const;

const PRIORITIES = [
  { value: "urgent", label: "Urgent", color: "text-red-600 bg-red-50 border-red-200 dark:bg-red-950/30" },
  { value: "high",   label: "High",   color: "text-orange-600 bg-orange-50 border-orange-200 dark:bg-orange-950/30" },
  { value: "medium", label: "Medium", color: "text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-950/30" },
  { value: "low",    label: "Low",    color: "text-sky-600 bg-sky-50 border-sky-200 dark:bg-sky-950/30" },
];

// The valid transitions we expose as action buttons
const TRANSITION_ACTIONS: {
  event: MaintenanceEvent;
  label: string;
  icon: React.ElementType;
  variant: "default" | "outline" | "destructive";
  fromStates: MaintenanceState[];
}[] = [
  {
    event: "ISSUE_ASSIGNED",
    label: "Assign",
    icon: UserCheck,
    variant: "default",
    fromStates: ["reported"],
  },
  {
    event: "ISSUE_STARTED",
    label: "Start Work",
    icon: Play,
    variant: "default",
    fromStates: ["assigned"],
  },
  {
    event: "ISSUE_RESOLVED",
    label: "Mark Resolved",
    icon: CheckCircle,
    variant: "default",
    fromStates: ["in_progress"],
  },
  {
    event: "ISSUE_CLOSED",
    label: "Close Issue",
    icon: CheckCircle,
    variant: "outline",
    fromStates: ["resolved"],
  },
  {
    event: "ISSUE_CANCELLED",
    label: "Cancel Issue",
    icon: XCircle,
    variant: "destructive",
    fromStates: ["reported", "assigned", "in_progress"],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function StateBadge({ state }: { state: string }) {
  const cfg = MAINTENANCE_STATE_DISPLAY[state as MaintenanceState] ?? {
    label: state,
    color: "text-slate-600",
    bgColor: "bg-slate-100",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize", cfg.color, cfg.bgColor)}>
      {cfg.label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const cfg = PRIORITIES.find((p) => p.value === priority) ?? PRIORITIES[2];
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", cfg.color)}>
      {cfg.label}
    </span>
  );
}

// ── Edit form ─────────────────────────────────────────────────────────────────

function EditForm({
  issue,
  onCancel,
}: {
  issue: MaintenanceIssue;
  onCancel: () => void;
}) {
  const { mutate: update, isPending } = useUpdateMaintenanceIssue();

  const [title,         setTitle]         = useState(issue.title);
  const [description,   setDescription]   = useState(issue.description ?? "");
  const [category,      setCategory]      = useState(issue.category);
  const [priority,      setPriority]      = useState(issue.priority);
  const [assignedTo,    setAssignedTo]    = useState(issue.assignedTo ?? "");
  const [estimatedCost, setEstimatedCost] = useState(
    issue.estimatedCost !== undefined ? String(issue.estimatedCost) : "",
  );
  const [actualCost,    setActualCost]    = useState(
    issue.actualCost !== undefined ? String(issue.actualCost) : "",
  );
  const [notes,         setNotes]         = useState(issue.notes ?? "");

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    update(
      {
        id: issue.id,
        data: {
          title,
          description,
          category: category as MaintenanceIssue["category"],
          priority: priority as MaintenanceIssue["priority"],
          assignedTo: assignedTo || undefined,
          estimatedCost: estimatedCost !== "" ? parseFloat(estimatedCost) : undefined,
          actualCost:    actualCost    !== "" ? parseFloat(actualCost)    : undefined,
          notes: notes || undefined,
        },
      },
      { onSuccess: onCancel },
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-4 max-w-2xl">
      {/* ── Core info ──────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Wrench className="h-4 w-4" />
            Issue Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ititle">Title *</Label>
            <Input
              id="ititle"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="idesc">Description</Label>
            <Textarea
              id="idesc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Describe the issue in detail..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="icat">Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as MaintenanceIssue["category"])}>
                <SelectTrigger id="icat"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ipri">Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as MaintenanceIssue["priority"])}>
                <SelectTrigger id="ipri"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Assignment & costs ─────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <UserCheck className="h-4 w-4" />
            Assignment & Costs
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="iassigned">Assigned To</Label>
            <Input
              id="iassigned"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              placeholder="Contractor or staff name"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="iest">Estimated Cost (UGX)</Label>
              <Input
                id="iest"
                type="number"
                min={0}
                value={estimatedCost}
                onChange={(e) => setEstimatedCost(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="iact">Actual Cost (UGX)</Label>
              <Input
                id="iact"
                type="number"
                min={0}
                value={actualCost}
                onChange={(e) => setActualCost(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Notes ─────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Internal notes about this issue..."
          />
        </CardContent>
      </Card>

      <Separator />

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          <X className="h-4 w-4" />
          Cancel
        </Button>
        <Button type="submit" loading={isPending}>
          <Save className="h-4 w-4" />
          Save Changes
        </Button>
      </div>
    </form>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MaintenanceDetailPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const { data: issue, isLoading } = useMaintenanceIssue(id);
  const { data: property } = useProperty(issue?.propertyId ?? "");
  const { can } = usePermissions();
  const canEdit = can("properties:write");
  const [editing, setEditing] = useState(false);

  const { mutate: transition, isPending: transitioning } = useTransitionMaintenanceIssue();

  if (isLoading) return <PageSkeleton />;
  if (!issue) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Wrench className="h-12 w-12 text-muted-foreground" />
        <p className="text-sm font-medium">Issue not found</p>
        <Button variant="outline" size="sm" onClick={() => router.back()}>Go back</Button>
      </div>
    );
  }

  // Treat legacy "open" state from mock data as "reported"
  const currentState = (issue.state === ("open" as MaintenanceState) ? "reported" : issue.state) as MaintenanceState;

  const availableActions = TRANSITION_ACTIONS.filter((a) =>
    a.fromStates.includes(currentState),
  );

  return (
    <div className="space-y-6 max-w-4xl">
      {/* ── Header ────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight">{issue.title}</h1>
              <StateBadge state={currentState} />
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-sm text-muted-foreground flex-wrap">
              <PriorityBadge priority={issue.priority} />
              <span>·</span>
              <span className="capitalize">{issue.category}</span>
              <span>·</span>
              <span>Reported {formatDate(issue.reportedAt ?? issue.createdAt)}</span>
            </div>
          </div>
        </div>

        {!editing && (
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {/* Status transition buttons */}
            {canEdit && availableActions.map((action) => (
              <Button
                key={action.event}
                variant={action.variant}
                size="sm"
                loading={transitioning}
                onClick={() => transition({ id: issue.id, event: action.event })}
              >
                <action.icon className="h-3.5 w-3.5" />
                {action.label}
              </Button>
            ))}
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Edit className="h-3.5 w-3.5" />
                Edit
              </Button>
            )}
          </div>
        )}
      </div>

      {editing ? (
        <EditForm issue={issue} onCancel={() => setEditing(false)} />
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ── Issue details ──────────────────────────── */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Description
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                  {issue.description || "No description provided."}
                </p>
              </CardContent>
            </Card>

            {/* ── Location ───────────────────────────────── */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Location
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Property</span>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-sm"
                    onClick={() => router.push(`/properties/${issue.propertyId}`)}
                  >
                    {property?.name ?? issue.propertyId}
                  </Button>
                </div>
                {issue.unitId && (
                  <>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Unit</span>
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-sm"
                        onClick={() => router.push(`/properties/${issue.propertyId}/units/${issue.unitId}`)}
                      >
                        <Home className="h-3.5 w-3.5 mr-1" />
                        {issue.unitName ?? issue.unitId}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* ── Assignment & costs ─────────────────────── */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <UserCheck className="h-4 w-4" />
                  Assignment & Costs
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Assigned To</span>
                  <span>{issue.assignedTo ?? "—"}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Reported By</span>
                  <span className="capitalize">{issue.reportedBy}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Estimated Cost</span>
                  <span>
                    {issue.estimatedCost !== undefined
                      ? formatCurrency(issue.estimatedCost, issue.currency ?? "UGX")
                      : "—"}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Actual Cost</span>
                  <span>
                    {issue.actualCost !== undefined
                      ? formatCurrency(issue.actualCost, issue.currency ?? "UGX")
                      : "—"}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* ── Timeline ───────────────────────────────── */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Timeline
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Reported</span>
                  <span>{formatDate(issue.reportedAt ?? issue.createdAt)}</span>
                </div>
                {issue.assignedAt && (
                  <>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Assigned</span>
                      <span>{formatDate(issue.assignedAt)}</span>
                    </div>
                  </>
                )}
                {issue.startedAt && (
                  <>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Started</span>
                      <span>{formatDate(issue.startedAt)}</span>
                    </div>
                  </>
                )}
                {issue.resolvedAt && (
                  <>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Resolved</span>
                      <span>{formatDate(issue.resolvedAt)}</span>
                    </div>
                  </>
                )}
                {issue.closedAt && (
                  <>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Closed</span>
                      <span>{formatDate(issue.closedAt)}</span>
                    </div>
                  </>
                )}
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last Updated</span>
                  <span>{formatDate(issue.updatedAt)}</span>
                </div>
              </CardContent>
            </Card>

            {/* ── Notes ─────────────────────────────────── */}
            {issue.notes && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{issue.notes}</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* ── Status flow ───────────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Wrench className="h-4 w-4" />
                Status Flow
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-1.5">
                {(["reported", "assigned", "in_progress", "resolved", "closed"] as MaintenanceState[]).map((s, i, arr) => {
                  const cfg = MAINTENANCE_STATE_DISPLAY[s];
                  const isActive = s === currentState;
                  const currentIdx = arr.indexOf(currentState);
                  const isPast = currentIdx > i;
                  return (
                    <div key={s} className="flex items-center gap-1.5">
                      {i > 0 && (
                        <div className={cn(
                          "h-px w-5 shrink-0 rounded-full",
                          isPast ? "bg-primary" : isActive ? "bg-primary/50" : "bg-slate-200 dark:bg-slate-700",
                        )} />
                      )}
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium capitalize transition-all",
                          isActive
                            ? "bg-primary text-white shadow-sm ring-2 ring-primary/20"
                            : isPast
                              ? "bg-primary/10 text-primary/80 dark:bg-primary/15 dark:text-primary/70"
                              : "bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700",
                        )}
                      >
                        {isPast && <Check className="h-3 w-3 shrink-0" />}
                        {cfg.label}
                      </span>
                    </div>
                  );
                })}
                {currentState === "cancelled" && (
                  <>
                    <div className="h-px w-5 bg-red-300 rounded-full" />
                    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-red-50 text-red-600 border border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800">
                      Cancelled
                    </span>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
