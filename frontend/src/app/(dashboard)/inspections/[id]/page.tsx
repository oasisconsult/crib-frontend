"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  CheckSquare,
  AlertCircle,
  Building2,
  Home,
  Calendar,
  User,
  ClipboardList,
  Play,
  CheckCircle,
  XCircle,
  ThumbsUp,
  RotateCcw,
  Edit,
  X,
  Save,
  Wrench,
  Clock,
  Camera,
  Loader2,
  ImageIcon,
  Trash2,
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
import { formatDate } from "@/utils/formatters";
import {
  useInspection,
  useUpdateInspection,
  useTransitionInspection,
  useMaintenanceIssues,
} from "@/hooks/useInspections";
import { inspectionsApi } from "@/services/api/inspections";
import { uploadsApi } from "@/services/api/uploads";
import { toast } from "@/store/useUIStore";
import { useProperty, useUnit } from "@/hooks/useProperties";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/utils/cn";
import {
  INSPECTION_STATE_DISPLAY,
  type InspectionState,
  type InspectionEvent,
} from "@/types/states";
import type { Inspection, ChecklistItem } from "@/types";

interface Props {
  params: Promise<{ id: string }>;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const CONDITIONS: { value: ChecklistItem["condition"]; label: string; color: string }[] = [
  { value: "excellent", label: "Excellent", color: "text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200" },
  { value: "good",      label: "Good",      color: "text-green-700 bg-green-50 dark:bg-green-950/30 border-green-200" },
  { value: "fair",      label: "Fair",      color: "text-amber-700 bg-amber-50 dark:bg-amber-950/30 border-amber-200" },
  { value: "poor",      label: "Poor",      color: "text-orange-700 bg-orange-50 dark:bg-orange-950/30 border-orange-200" },
  { value: "damaged",   label: "Damaged",   color: "text-red-700 bg-red-50 dark:bg-red-950/30 border-red-200" },
];

const OVERALL_CONDITIONS = ["excellent", "good", "fair", "poor"] as const;

const TRANSITION_ACTIONS: {
  event: InspectionEvent;
  label: string;
  icon: React.ElementType;
  variant: "default" | "outline" | "destructive";
  fromStates: InspectionState[];
}[] = [
  {
    event: "INSPECTION_STARTED",
    label: "Start Inspection",
    icon: Play,
    variant: "default",
    fromStates: ["scheduled"],
  },
  {
    event: "INSPECTION_COMPLETED",
    label: "Mark Complete",
    icon: CheckCircle,
    variant: "default",
    fromStates: ["in_progress"],
  },
  {
    event: "INSPECTION_APPROVED",
    label: "Approve",
    icon: ThumbsUp,
    variant: "default",
    fromStates: ["completed"],
  },
  {
    event: "INSPECTION_FAILED",
    label: "Mark Failed",
    icon: XCircle,
    variant: "outline",
    fromStates: ["in_progress", "completed"],
  },
  {
    event: "INSPECTION_CANCELLED",
    label: "Cancel",
    icon: XCircle,
    variant: "destructive",
    fromStates: ["scheduled", "in_progress"],
  },
  {
    event: "INSPECTION_CREATED",
    label: "Reschedule",
    icon: RotateCcw,
    variant: "outline",
    fromStates: ["failed", "cancelled"],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function StateBadge({ state }: { state: string }) {
  const cfg = INSPECTION_STATE_DISPLAY[state as InspectionState] ?? {
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

function conditionConfig(condition: ChecklistItem["condition"]) {
  return CONDITIONS.find((c) => c.value === condition);
}

function isPass(condition: ChecklistItem["condition"]) {
  return condition && condition !== "poor" && condition !== "damaged";
}

// ── Edit form ─────────────────────────────────────────────────────────────────

function EditForm({
  inspection,
  onCancel,
}: {
  inspection: Inspection;
  onCancel: () => void;
}) {
  const { mutate: update, isPending } = useUpdateInspection();

  // inspectorName may come as .inspector in mock data
  const inspectorRaw = (inspection as any).inspector ?? inspection.inspectorName ?? "";

  const [scheduledDate,     setScheduledDate]     = useState(inspection.scheduledDate ?? "");
  const [scheduledTimeSlot, setScheduledTimeSlot] = useState(inspection.scheduledTimeSlot ?? "");
  const [inspectorName,     setInspectorName]     = useState(inspectorRaw);
  const [overallCondition,  setOverallCondition]  = useState(inspection.overallCondition ?? "");
  const [summary,           setSummary]           = useState(inspection.summary ?? "");
  const [recommendations,   setRecommendations]   = useState(inspection.recommendations ?? "");

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    update(
      {
        id: inspection.id,
        data: {
          scheduledDate,
          scheduledTimeSlot: scheduledTimeSlot || undefined,
          inspectorName: inspectorName || undefined,
          overallCondition: overallCondition as Inspection["overallCondition"] || undefined,
          summary: summary || undefined,
          recommendations: recommendations || undefined,
        },
      },
      { onSuccess: onCancel },
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-4 max-w-2xl">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Schedule
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="sdate">Scheduled Date *</Label>
              <Input
                id="sdate"
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="stime">Time Slot</Label>
              <Input
                id="stime"
                value={scheduledTimeSlot}
                onChange={(e) => setScheduledTimeSlot(e.target.value)}
                placeholder="e.g. 10:00-12:00"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sinspector">Inspector</Label>
            <Input
              id="sinspector"
              value={inspectorName}
              onChange={(e) => setInspectorName(e.target.value)}
              placeholder="Inspector name"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Findings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="soveral">Overall Condition</Label>
            <Select
              value={overallCondition}
              onValueChange={setOverallCondition}
            >
              <SelectTrigger id="soverall"><SelectValue placeholder="Select condition" /></SelectTrigger>
              <SelectContent>
                {OVERALL_CONDITIONS.map((c) => (
                  <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ssummary">Inspector Notes / Summary</Label>
            <Textarea
              id="ssummary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={4}
              placeholder="Describe overall findings..."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="srec">Recommendations</Label>
            <Textarea
              id="srec"
              value={recommendations}
              onChange={(e) => setRecommendations(e.target.value)}
              rows={3}
              placeholder="Recommended repairs or follow-ups..."
            />
          </div>
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

// ── Checklist editor ──────────────────────────────────────────────────────────

function ChecklistEditor({
  inspection,
  editable,
}: {
  inspection: Inspection;
  editable: boolean;
}) {
  const { mutate: update, isPending } = useUpdateInspection();
  const [items, setItems] = useState<ChecklistItem[]>(inspection.checklist ?? []);
  const [dirty, setDirty] = useState(false);

  function setCondition(index: number, condition: ChecklistItem["condition"]) {
    setItems((prev) => prev.map((item, i) => i === index ? { ...item, condition } : item));
    setDirty(true);
  }

  function setNotes(index: number, notes: string) {
    setItems((prev) => prev.map((item, i) => i === index ? { ...item, notes } : item));
    setDirty(true);
  }

  function handleSave() {
    update({ id: inspection.id, data: { checklist: items } });
    setDirty(false);
  }

  const passed  = items.filter((i) => isPass(i.condition)).length;
  const assessed = items.filter((i) => i.condition !== null).length;
  const total   = items.length;
  const pct     = total > 0 ? Math.round((passed / total) * 100) : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Checklist
          </CardTitle>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {assessed}/{total} assessed · {passed} passed
            </span>
            {editable && dirty && (
              <Button size="sm" onClick={handleSave} loading={isPending}>
                <Save className="h-3.5 w-3.5" />
                Save
              </Button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {total > 0 && (
          <div className="mt-2 space-y-1">
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500",
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">{pct}% pass rate</p>
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0">
        <div className="divide-y">
          {items.map((item, idx) => {
            const cfg = conditionConfig(item.condition);
            const pass = isPass(item.condition);
            return (
              <div
                key={item.id ?? idx}
                className={cn(
                  "p-4 transition-colors",
                  item.condition
                    ? pass
                      ? "bg-emerald-50/40 dark:bg-emerald-950/10"
                      : "bg-red-50/40 dark:bg-red-950/10"
                    : "",
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    {item.condition ? (
                      pass
                        ? <CheckSquare className="h-4 w-4 text-emerald-600" />
                        : <AlertCircle className="h-4 w-4 text-red-600" />
                    ) : (
                      <div className="h-4 w-4 rounded border-2 border-muted-foreground/30" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{item.area}</p>
                        <p className="text-xs text-muted-foreground">{item.description}</p>
                      </div>

                      {editable ? (
                        <Select
                          value={item.condition ?? ""}
                          onValueChange={(v) => setCondition(idx, v as ChecklistItem["condition"])}
                        >
                          <SelectTrigger className="h-7 w-[130px] text-xs">
                            <SelectValue placeholder="Set condition" />
                          </SelectTrigger>
                          <SelectContent>
                            {CONDITIONS.map((c) => (
                              <SelectItem key={c.value} value={c.value ?? ""} className="text-xs capitalize">
                                {c.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : cfg ? (
                        <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize", cfg.color)}>
                          {cfg.label}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Not assessed</span>
                      )}
                    </div>

                    {editable ? (
                      <Input
                        value={item.notes ?? ""}
                        onChange={(e) => setNotes(idx, e.target.value)}
                        placeholder="Add notes..."
                        className="h-7 text-xs"
                      />
                    ) : item.notes ? (
                      <p className="text-xs text-muted-foreground">{item.notes}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}

          {items.length === 0 && (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No checklist items defined for this inspection.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Photos section ────────────────────────────────────────────────────────────

function PhotosSection({
  inspection,
  editable,
}: {
  inspection: Inspection;
  editable: boolean;
}) {
  const [photos, setPhotos] = useState<string[]>((inspection as any).photoUrls ?? []);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    e.target.value = "";
    setUploading(true);
    try {
      const results = await Promise.all(
        files.map((f) => uploadsApi.uploadFile(f, { category: "inspection_photo", inspectionId: inspection.id })),
      );
      const urls = results.map((r) => r.url);
      await inspectionsApi.addPhotos(inspection.id, urls);
      setPhotos((prev) => [...prev, ...urls]);
      toast.success(`${files.length} photo${files.length > 1 ? "s" : ""} added`);
    } catch {
      toast.error("Failed to upload photos");
    } finally {
      setUploading(false);
    }
  }

  function removeLocal(url: string) {
    setPhotos((prev) => prev.filter((p) => p !== url));
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Camera className="h-4 w-4" />
            Photos
            {photos.length > 0 && (
              <Badge variant="secondary" className="ml-1">{photos.length}</Badge>
            )}
          </CardTitle>
          {editable && (
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={handleFiles}
                disabled={uploading}
              />
              <span className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-accent transition-colors">
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Camera className="h-3.5 w-3.5" />
                )}
                {uploading ? "Uploading…" : "Add Photos"}
              </span>
            </label>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {photos.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
            <ImageIcon className="h-8 w-8 opacity-30" />
            <p className="text-sm">No photos yet</p>
            {editable && (
              <label className="cursor-pointer text-xs text-primary underline-offset-2 hover:underline">
                <input type="file" accept="image/*" multiple className="sr-only" onChange={handleFiles} />
                Upload the first photo
              </label>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {photos.map((url, i) => (
              <div key={url} className="group relative aspect-square rounded-md overflow-hidden border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`Photo ${i + 1}`}
                  className="h-full w-full object-cover cursor-pointer"
                  onClick={() => setLightbox(url)}
                />
                {editable && (
                  <button
                    onClick={() => removeLocal(url)}
                    className="absolute top-1 right-1 hidden group-hover:flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="Full size"
            className="max-h-[90vh] max-w-[90vw] rounded-lg shadow-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function InspectionDetailPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();

  const { data: inspection, isLoading } = useInspection(id);
  const { data: property } = useProperty(inspection?.propertyId ?? "");
  const { data: unit }     = useUnit(inspection?.propertyId ?? "", inspection?.unitId ?? "");
  const { data: maintData } = useMaintenanceIssues();
  const { can } = usePermissions();
  const canEdit = can("properties:write");

  const [editing, setEditing] = useState(false);
  const { mutate: transition, isPending: transitioning } = useTransitionInspection();

  if (isLoading) return <PageSkeleton />;
  if (!inspection) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <ClipboardList className="h-12 w-12 text-muted-foreground" />
        <p className="text-sm font-medium">Inspection not found</p>
        <Button variant="outline" size="sm" onClick={() => router.back()}>Go back</Button>
      </div>
    );
  }

  const currentState = inspection.state as InspectionState;
  const stateCfg     = INSPECTION_STATE_DISPLAY[currentState];

  // inspector may be stored under .inspector in mock data
  const inspectorName = (inspection as any).inspector ?? inspection.inspectorName;

  const availableActions = TRANSITION_ACTIONS.filter((a) =>
    a.fromStates.includes(currentState),
  );

  const checklist    = inspection.checklist ?? [];
  const passed       = checklist.filter((i) => isPass(i.condition)).length;
  const failed       = checklist.filter((i) => i.condition === "poor" || i.condition === "damaged").length;
  const unassessed   = checklist.filter((i) => !i.condition).length;
  const checklistPct = checklist.length > 0 ? Math.round((passed / checklist.length) * 100) : 0;

  const checklistEditable = canEdit && (currentState === "scheduled" || currentState === "in_progress");

  // Linked maintenance issues
  const linkedMaint = (maintData?.data ?? []).filter(
    (m) => inspection.maintenanceIssueIds?.includes(m.id),
  );

  // State flow steps (linear path, excluding branches)
  const stateFlow: InspectionState[] = ["scheduled", "in_progress", "completed", "approved"];
  const currentFlowIdx = stateFlow.indexOf(currentState);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* ── Header ────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold tracking-tight capitalize">
                {inspection.type.replace(/_/g, " ")} Inspection
              </h1>
              <StateBadge state={currentState} />
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {property?.name ?? inspection.propertyId}
              {unit && ` · ${unit.name}`}
              <span className="font-mono text-xs ml-2 text-muted-foreground/60">#{inspection.id.slice(-8).toUpperCase()}</span>
            </p>
          </div>
        </div>

        {!editing && (
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {canEdit && availableActions.map((action) => (
              <Button
                key={action.event}
                variant={action.variant}
                size="sm"
                loading={transitioning}
                onClick={() => transition({ id: inspection.id, event: action.event })}
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
        <EditForm inspection={inspection} onCancel={() => setEditing(false)} />
      ) : (
        <>
          {/* ── Summary stat chips ────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {
                label: "Scheduled",
                value: formatDate(inspection.scheduledDate),
                sub: inspection.scheduledTimeSlot ?? "—",
                icon: Calendar,
                color: "text-indigo-600",
                bg: "bg-indigo-50 dark:bg-indigo-950/30",
              },
              {
                label: "Inspector",
                value: inspectorName ?? "—",
                sub: "Assigned",
                icon: User,
                color: "text-violet-600",
                bg: "bg-violet-50 dark:bg-violet-950/30",
              },
              {
                label: "Checklist",
                value: `${passed}/${checklist.length}`,
                sub: `${checklistPct}% pass rate`,
                icon: ClipboardList,
                color: checklistPct >= 80 ? "text-emerald-600" : checklistPct >= 50 ? "text-amber-600" : "text-red-600",
                bg: checklistPct >= 80 ? "bg-emerald-50 dark:bg-emerald-950/30" : checklistPct >= 50 ? "bg-amber-50 dark:bg-amber-950/30" : "bg-red-50 dark:bg-red-950/30",
              },
              {
                label: "Overall",
                value: inspection.overallCondition ? inspection.overallCondition.charAt(0).toUpperCase() + inspection.overallCondition.slice(1) : "—",
                sub: "Condition",
                icon: CheckCircle,
                color: "text-sky-600",
                bg: "bg-sky-50 dark:bg-sky-950/30",
              },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border bg-[hsl(var(--card))] p-4">
                <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center mb-2", s.bg)}>
                  <s.icon className={cn("h-4 w-4", s.color)} />
                </div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className={cn("text-base font-semibold mt-0.5 truncate", s.color)}>{s.value}</p>
                <p className="text-xs text-muted-foreground truncate">{s.sub}</p>
              </div>
            ))}
          </div>

          {/* ── State flow ────────────────────────────────── */}
          <Card>
            <CardContent className="py-4">
              <div className="flex flex-wrap items-center gap-1.5">
                {stateFlow.map((s, i) => {
                  const isActive = s === currentState;
                  const isPast = currentFlowIdx > i;
                  return (
                    <div key={s} className="flex items-center gap-1.5">
                      {i > 0 && (
                        <div className={cn(
                          "h-px w-6 shrink-0 rounded-full",
                          isPast ? "bg-primary" : isActive ? "bg-primary/50" : "bg-slate-200 dark:bg-slate-700",
                        )} />
                      )}
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium capitalize transition-all",
                          isActive
                            // Current step: solid teal, white text, subtle ring
                            ? "bg-primary text-white shadow-sm ring-2 ring-primary/20"
                            : isPast
                              // Completed step: soft teal tint, teal text, check mark
                              ? "bg-primary/10 text-primary/80 dark:bg-primary/15 dark:text-primary/70"
                              // Upcoming step: grey outline, muted text
                              : "bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700",
                        )}
                      >
                        {isPast && <Check className="h-3 w-3 shrink-0" />}
                        {INSPECTION_STATE_DISPLAY[s]?.label ?? s.replace(/_/g, " ")}
                      </span>
                    </div>
                  );
                })}
                {(currentState === "failed" || currentState === "cancelled") && (
                  <>
                    <div className="h-px w-6 bg-red-300 rounded-full" />
                    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-red-50 text-red-600 border border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800">
                      {INSPECTION_STATE_DISPLAY[currentState].label}
                    </span>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* ── Left col: checklist + photos + notes ──── */}
            <div className="lg:col-span-2 space-y-6">
              {checklist.length > 0 && (
                <ChecklistEditor
                  inspection={inspection}
                  editable={checklistEditable}
                />
              )}

              <PhotosSection inspection={inspection} editable={checklistEditable} />

              {inspection.summary && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Inspector Notes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{inspection.summary}</p>
                  </CardContent>
                </Card>
              )}

              {inspection.recommendations && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Recommendations</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{inspection.recommendations}</p>
                  </CardContent>
                </Card>
              )}

              {/* Linked maintenance issues */}
              {linkedMaint.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Wrench className="h-4 w-4" />
                      Linked Maintenance Issues
                      <Badge variant="secondary" className="ml-1">{linkedMaint.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y">
                      {linkedMaint.map((m) => (
                        <button
                          key={m.id}
                          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                          onClick={() => router.push(`/maintenance/${m.id}`)}
                        >
                          <div>
                            <p className="text-sm font-medium">{m.title}</p>
                            <p className="text-xs text-muted-foreground capitalize">{m.category} · {m.priority} priority</p>
                          </div>
                          <span className={cn(
                            "text-xs rounded-full px-2 py-0.5 capitalize",
                            m.state === "resolved" || m.state === "closed"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-amber-100 text-amber-700",
                          )}>
                            {m.state}
                          </span>
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* ── Right col: details sidebar ─────────────── */}
            <div className="space-y-4">
              {/* Details */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Type</span>
                    <span className="capitalize">{inspection.type.replace(/_/g, " ")}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Property</span>
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-sm"
                      onClick={() => router.push(`/properties/${inspection.propertyId}`)}
                    >
                      <Building2 className="h-3.5 w-3.5 mr-1" />
                      {property?.name ?? inspection.propertyId}
                    </Button>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Unit</span>
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-sm"
                      onClick={() => router.push(`/properties/${inspection.propertyId}/units/${inspection.unitId}`)}
                    >
                      <Home className="h-3.5 w-3.5 mr-1" />
                      {unit?.name ?? inspection.unitId}
                    </Button>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Inspector</span>
                    <span>{inspectorName ?? "—"}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Timeline */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Timeline
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Scheduled</span>
                    <span>{formatDate(inspection.scheduledDate)}</span>
                  </div>
                  {inspection.startedAt && (
                    <>
                      <Separator />
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Started</span>
                        <span>{formatDate(inspection.startedAt)}</span>
                      </div>
                    </>
                  )}
                  {inspection.completedAt && (
                    <>
                      <Separator />
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Completed</span>
                        <span>{formatDate(inspection.completedAt)}</span>
                      </div>
                    </>
                  )}
                  {inspection.approvedAt && (
                    <>
                      <Separator />
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Approved</span>
                        <span>{formatDate(inspection.approvedAt)}</span>
                      </div>
                    </>
                  )}
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Created</span>
                    <span>{formatDate(inspection.createdAt)}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Pass/fail summary */}
              {checklist.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Result Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-emerald-600">Passed</span>
                      <Badge variant="success">{passed}</Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-red-600">Failed</span>
                      <Badge variant="destructive">{failed}</Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Not Assessed</span>
                      <Badge variant="secondary">{unassessed}</Badge>
                    </div>
                    <Separator />
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden flex">
                      {checklist.length > 0 && (
                        <>
                          <div
                            className="h-full bg-emerald-500 transition-all"
                            style={{ width: `${(passed / checklist.length) * 100}%` }}
                          />
                          <div
                            className="h-full bg-red-500 transition-all"
                            style={{ width: `${(failed / checklist.length) * 100}%` }}
                          />
                        </>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground text-right">{checklistPct}% pass rate</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
