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
  UserPlus,
  ClipboardList,
  Play,
  CheckCircle,
  XCircle,
  ThumbsUp,
  RotateCcw,
  Edit,
  ExternalLink,
  X,
  Save,
  Wrench,
  Clock,
  Camera,
  Loader2,
  ImageIcon,
  Trash2,
  FileDown,
  PenLine,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageSkeleton } from "@/components/common/LoadingSkeleton";
import { formatDate, formatDateTime } from "@/utils/formatters";
import { useQueryClient } from "@tanstack/react-query";
import {
  useInspection,
  useUpdateInspection,
  useTransitionInspection,
  useMaintenanceIssues,
  useAssignInspector,
  useResendInspectorInvite,
  useContractors,
} from "@/hooks/useInspections";
import { queryKeys } from "@/lib/queryClient";
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

// ── Helpers ───────────────────────────────────────────────────────────────────

// Known storage key prefixes — all bucket objects start with one of these.
// Extracts the key from a stored URL and routes it through the authenticated
// backend proxy so the browser never hits the private MinIO bucket directly.
const _KEY_PREFIXES = ["inspections/", "documents/", "signatures/", "properties/", "payment_receipt/"];

function toProxyUrl(url: string): string {
  if (!url) return url;
  // Already a proxy or local dev URL — leave as-is
  if (url.startsWith("/api/v1/upload/") || url.startsWith("/api/upload/local/")) return url;
  for (const prefix of _KEY_PREFIXES) {
    const idx = url.indexOf(prefix);
    if (idx !== -1) return `/api/v1/upload/serve/${url.slice(idx)}`;
  }
  return url;
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
    color: "text-muted-foreground",
    bgColor: "bg-muted",
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

// Normalise per-item photos — old records stored by inspector were persisted
// with snake_case keys (photo_urls) before the fix; new ones use photoUrls.
function itemPhotos(item: ChecklistItem): string[] {
  return item.photoUrls ?? (item as unknown as { photo_urls?: string[] }).photo_urls ?? [];
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
    <form onSubmit={handleSave} className="space-y-4">
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

const MAX_ITEM_PHOTOS = 2;

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
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  function setCondition(index: number, condition: ChecklistItem["condition"]) {
    setItems((prev) => prev.map((item, i) => i === index ? { ...item, condition } : item));
    setDirty(true);
  }

  function setNotes(index: number, notes: string) {
    setItems((prev) => prev.map((item, i) => i === index ? { ...item, notes } : item));
    setDirty(true);
  }

  async function handleItemPhoto(index: number, files: FileList | null) {
    if (!files?.length) return;
    const item = items[index];
    const current = itemPhotos(item);
    const slots = MAX_ITEM_PHOTOS - current.length;
    if (slots <= 0) return;
    const toUpload = Array.from(files).slice(0, slots);
    setUploadingIdx(index);
    try {
      const results = await Promise.all(
        toUpload.map((f) => uploadsApi.uploadFile(f, { category: "inspection_photo", inspectionId: inspection.id })),
      );
      setItems((prev) => prev.map((it, i) =>
        i === index ? { ...it, photoUrls: [...(it.photoUrls ?? []), ...results.map((r) => r.url)] } : it,
      ));
      setDirty(true);
    } catch {
      toast.error("Failed to upload photo");
    } finally {
      setUploadingIdx(null);
    }
  }

  function removeItemPhoto(index: number, url: string) {
    setItems((prev) => prev.map((it, i) =>
      i === index ? { ...it, photoUrls: (it.photoUrls ?? []).filter((u) => u !== url) } : it,
    ));
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
            <div className="h-1.5 w-full rounded-full bg-primary/10 overflow-hidden">
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

                    {/* Per-item photos */}
                    {(itemPhotos(item).length > 0 || editable) && (
                      <div className="space-y-1.5">
                        {/* Thumbnails */}
                        {itemPhotos(item).length > 0 && (
                          <div className="flex gap-1.5 flex-wrap">
                            {itemPhotos(item).map((url) => (
                              <div key={url} className="group relative h-16 w-16 rounded border overflow-hidden bg-muted shrink-0">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={toProxyUrl(url)}
                                  alt="Item photo"
                                  className="h-full w-full object-cover cursor-pointer"
                                  onClick={() => setLightbox(url)}
                                />
                                {editable && (
                                  <button
                                    onClick={() => removeItemPhoto(idx, url)}
                                    className="absolute top-0.5 right-0.5 hidden group-hover:flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white"
                                  >
                                    <X className="h-2.5 w-2.5" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Upload controls — only when slots remain */}
                        {editable && itemPhotos(item).length < MAX_ITEM_PHOTOS && (
                          <div className="flex items-center gap-1.5">
                            {/* Camera capture */}
                            <label className="cursor-pointer">
                              <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                className="sr-only"
                                disabled={uploadingIdx === idx}
                                onChange={(e) => handleItemPhoto(idx, e.target.files)}
                              />
                              <span className="inline-flex items-center gap-1 rounded border border-input bg-background px-2 py-1 text-[10px] font-medium hover:bg-accent transition-colors">
                                {uploadingIdx === idx
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : <Camera className="h-3 w-3" />}
                                Photo
                              </span>
                            </label>
                            {/* Gallery picker */}
                            <label className="cursor-pointer">
                              <input
                                type="file"
                                accept="image/*"
                                className="sr-only"
                                disabled={uploadingIdx === idx}
                                onChange={(e) => handleItemPhoto(idx, e.target.files)}
                              />
                              <span className="inline-flex items-center gap-1 rounded border border-input bg-background px-2 py-1 text-[10px] font-medium hover:bg-accent transition-colors">
                                <ImageIcon className="h-3 w-3" />
                                Upload
                              </span>
                            </label>
                            <span className="text-[10px] text-muted-foreground">
                              {MAX_ITEM_PHOTOS - itemPhotos(item).length} slot{MAX_ITEM_PHOTOS - itemPhotos(item).length !== 1 ? "s" : ""} left
                            </span>
                          </div>
                        )}
                        {editable && itemPhotos(item).length >= MAX_ITEM_PHOTOS && (
                          <p className="text-[10px] text-muted-foreground">Max {MAX_ITEM_PHOTOS} photos per item</p>
                        )}
                      </div>
                    )}
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

      {/* Lightbox for item photos */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={toProxyUrl(lightbox)}
            alt="Full size"
            className="max-h-[90vh] max-w-[90vw] rounded-[6px] shadow-2xl object-contain"
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

  // No photos + not editable: nothing to show
  if (!editable && photos.length === 0) return null;

  // No photos + editable: compact inline uploader — no big empty card
  if (editable && photos.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-[6px] border border-dashed bg-muted/20 px-4 py-3">
        <Camera className="h-4 w-4 text-muted-foreground/50 shrink-0" />
        <span className="text-sm text-muted-foreground">General photos</span>
        <div className="flex items-center gap-3 ml-auto">
          <label className="cursor-pointer">
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={handleFiles} disabled={uploading} />
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline underline-offset-2">
              {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
              Camera
            </span>
          </label>
          <label className="cursor-pointer">
            <input type="file" accept="image/*" multiple className="sr-only" onChange={handleFiles} disabled={uploading} />
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline underline-offset-2">
              <ImageIcon className="h-3 w-3" />
              Gallery
            </span>
          </label>
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Camera className="h-4 w-4" />
            Photos
            {photos.length > 0 && (
              <Badge variant="secondary" className="ml-1">{photos.length}</Badge>
            )}
          </CardTitle>
          {editable && (
            <div className="flex items-center gap-2">
              {/* Camera capture — opens device camera on mobile */}
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={handleFiles}
                  disabled={uploading}
                />
                <span className="inline-flex items-center gap-1.5 rounded-[5px] border border-input bg-background px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-accent transition-colors">
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                  {uploading ? "Uploading…" : "Take Photo"}
                </span>
              </label>
              {/* Gallery picker */}
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  onChange={handleFiles}
                  disabled={uploading}
                />
                <span className="inline-flex items-center gap-1.5 rounded-[5px] border border-input bg-background px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-accent transition-colors">
                  <ImageIcon className="h-3.5 w-3.5" />
                  Gallery
                </span>
              </label>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {photos.map((url, i) => (
            <div key={url} className="group relative aspect-square rounded-[5px] overflow-hidden border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={toProxyUrl(url)}
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
      </CardContent>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={toProxyUrl(lightbox)}
            alt="Full size"
            className="max-h-[90vh] max-w-[90vw] rounded-[6px] shadow-2xl object-contain"
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

// ── Report & signature section ────────────────────────────────────────────────

function ReportSignatureSection({
  inspection,
  canEdit,
  onUpdated,
}: {
  inspection: Inspection;
  canEdit: boolean;
  onUpdated: () => void;
}) {
  const [signerName, setSignerName] = useState("");
  const [loading, setLoading] = useState<string | null>(null);

  const isSignable = inspection.state === "completed" || inspection.state === "approved";
  const hasLandlordSig = !!inspection.landlordSignedAt;
  const hasTenantSig = !!inspection.tenantSignedAt;
  const isSealed = hasLandlordSig && hasTenantSig;

  async function handleGenerateReport() {
    setLoading("report");
    try {
      await inspectionsApi.generateReport(inspection.id);
      toast.success("Report generated");
      onUpdated();
    } catch {
      toast.error("Failed to generate report");
    } finally {
      setLoading(null);
    }
  }

  async function handleSignLandlord() {
    if (!signerName.trim()) { toast.error("Enter your name to sign"); return; }
    setLoading("landlord");
    try {
      await inspectionsApi.signLandlord(inspection.id, signerName.trim());
      toast.success("Signed successfully");
      setSignerName("");
      onUpdated();
    } catch {
      toast.error("Failed to record signature");
    } finally {
      setLoading(null);
    }
  }

  async function handleSendForSigning() {
    setLoading("send");
    try {
      await inspectionsApi.sendForSigning(inspection.id);
      toast.success("Sign link sent to tenant");
      onUpdated();
    } catch (err: any) {
      toast.error(err?.detail ?? "Failed to send sign link");
    } finally {
      setLoading(null);
    }
  }

  if (!isSignable) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <PenLine className="h-4 w-4" />
            Report &amp; Signatures
          </CardTitle>
          {inspection.reportPdfUrl && (
            <a
              href={inspectionsApi.reportDownloadUrl(inspection.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-[5px] border border-input bg-background px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-accent transition-colors"
            >
              <FileDown className="h-3.5 w-3.5" />
              {isSealed ? "Download Sealed Report" : "Download Draft Report"}
            </a>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status chips */}
        <div className="flex flex-wrap gap-2">
          <span className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
            hasLandlordSig
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
              : "bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300",
          )}>
            {hasLandlordSig ? <Check className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
            {hasLandlordSig
              ? `Landlord signed · ${inspection.landlordSignedBy}`
              : "Landlord: awaiting signature"}
          </span>
          <span className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
            hasTenantSig
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
              : "bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300",
          )}>
            {hasTenantSig ? <Check className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
            {hasTenantSig ? "Tenant signed" : "Tenant: awaiting signature"}
          </span>
          {isSealed && (
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium bg-primary/10 text-primary">
              <Check className="h-3 w-3" />
              Fully executed
            </span>
          )}
        </div>

        {/* Actions */}
        {canEdit && !isSealed && (
          <div className="space-y-3 border-t pt-3">
            {/* Generate / regenerate report */}
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {inspection.reportPdfUrl ? "Regenerate the PDF report." : "Generate a PDF report to share or download."}
              </p>
              <Button size="sm" variant="outline" loading={loading === "report"} onClick={handleGenerateReport}>
                <FileDown className="h-3.5 w-3.5" />
                {inspection.reportPdfUrl ? "Regenerate Report" : "Generate Report"}
              </Button>
            </div>

            {/* Landlord sign */}
            {!hasLandlordSig && (
              <div className="space-y-2">
                <p className="text-xs font-medium">Sign as landlord / property manager</p>
                <div className="flex gap-2">
                  <Input
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    placeholder="Your full name"
                    className="h-8 text-xs"
                  />
                  <Button size="sm" loading={loading === "landlord"} onClick={handleSignLandlord}>
                    <PenLine className="h-3.5 w-3.5" />
                    Sign
                  </Button>
                </div>
              </div>
            )}

            {/* Send to tenant */}
            {hasLandlordSig && !hasTenantSig && (
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  Send a sign link to the tenant (14-day expiry).
                </p>
                <Button size="sm" variant="outline" loading={loading === "send"} onClick={handleSendForSigning}>
                  <Send className="h-3.5 w-3.5" />
                  Send to Tenant
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Assign Inspector Modal ────────────────────────────────────────────────────

function AssignInspectorModal({
  inspectionId,
  onClose,
  onAssigned,
}: {
  inspectionId: string;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const { data: contractorsData, isLoading } = useContractors({ isActive: true });
  const inspectors = (contractorsData?.data ?? []).filter((c) => c.isInspector);
  const [selectedId, setSelectedId] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(7);
  const { mutate: assign, isPending } = useAssignInspector();

  const handleAssign = () => {
    if (!selectedId) return;
    assign(
      { id: inspectionId, contractorId: selectedId, expiresInDays },
      {
        onSuccess: () => {
          onAssigned();
          onClose();
        },
      },
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Inspector</DialogTitle>
          <DialogDescription>
            Select an inspector from your contractor directory. They will receive an email with a
            private link to complete the inspection checklist — no account required.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : inspectors.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center space-y-2">
            <UserPlus className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="text-sm font-medium">No inspectors in your directory</p>
            <p className="text-xs text-muted-foreground">
              Go to <strong>Contractors</strong> and enable the &ldquo;Is Inspector&rdquo; flag on the contractors who perform inspections.
            </p>
            <Button variant="outline" size="sm" asChild>
              <a href="/contractors">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Manage Contractors
              </a>
            </Button>
          </div>
        ) : (
          <div className="space-y-4 px-1 py-2">
            <div className="space-y-1.5">
              <Label>Inspector</Label>
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an inspector…" />
                </SelectTrigger>
                <SelectContent>
                  {inspectors.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <div className="flex flex-col text-left">
                        <span>{c.name}</span>
                        {c.email && (
                          <span className="text-xs text-muted-foreground">{c.email}</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Link expires in (days)</Label>
              <Select
                value={String(expiresInDays)}
                onValueChange={(v) => setExpiresInDays(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[3, 7, 14, 30].map((d) => (
                    <SelectItem key={d} value={String(d)}>{d} days</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                The inspector portal link expires after this many days.
              </p>
            </div>
          </div>
        )}

        {inspectors.length > 0 && (
          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
            <Button onClick={handleAssign} disabled={!selectedId || isPending} loading={isPending}>
              <UserPlus className="h-3.5 w-3.5 mr-1.5" />
              Assign &amp; Send Invite
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}


// ── Main page ─────────────────────────────────────────────────────────────────

export default function InspectionDetailPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();

  const qc = useQueryClient();
  const { data: inspection, isLoading } = useInspection(id);
  const { data: property } = useProperty(inspection?.propertyId ?? "");
  const { data: unit }     = useUnit(inspection?.propertyId ?? "", inspection?.unitId ?? "");
  const { data: maintData } = useMaintenanceIssues();
  const { can } = usePermissions();
  const canEdit = can("properties:write");

  const [editing, setEditing] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const { mutate: transition, isPending: transitioning } = useTransitionInspection();
  const { mutate: resendInvite, isPending: resending } = useResendInspectorInvite();

  function refreshInspection() {
    qc.invalidateQueries({ queryKey: queryKeys.inspections.detail(id) });
  }

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
                onClick={() => {
                  if (action.event === "INSPECTION_CANCELLED" && inspection.inspectorContractorId) {
                    setCancelConfirmOpen(true);
                  } else {
                    transition({ id: inspection.id, event: action.event });
                  }
                }}
              >
                <action.icon className="h-3.5 w-3.5" />
                {action.label}
              </Button>
            ))}
            {canEdit && (currentState === "scheduled" || currentState === "in_progress") && (
              <Button variant="outline" size="sm" onClick={() => setAssignOpen(true)}>
                <UserPlus className="h-3.5 w-3.5" />
                Assign Inspector
              </Button>
            )}
            {canEdit && inspection.inspectorContractorId && !inspection.inspectorSubmittedAt && (
              <Button
                variant="outline"
                size="sm"
                loading={resending}
                onClick={() => resendInvite(id)}
              >
                <Send className="h-3.5 w-3.5" />
                Resend Invite
              </Button>
            )}
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Edit className="h-3.5 w-3.5" />
                Edit
              </Button>
            )}
          </div>
        )}
      </div>

      {/* ── Summary stat chips (view mode only) ─────── */}
      {!editing && (
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
                sub: inspection.inspectorSubmittedAt
                  ? "Submitted"
                  : inspection.inspectorContractorId
                  ? "Invite sent"
                  : inspectorName
                  ? "Assigned"
                  : "Not assigned",
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
                color: "text-teal-600",
                bg: "bg-teal-50 dark:bg-teal-950/30",
              },
            ].map((s) => (
              <div key={s.label} className="rounded-[6px] border bg-[hsl(var(--card))] p-4">
                <div className={cn("h-8 w-8 rounded-[6px] flex items-center justify-center mb-2", s.bg)}>
                  <s.icon className={cn("h-4 w-4", s.color)} />
                </div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className={cn("text-base font-semibold mt-0.5 truncate", s.color)}>{s.value}</p>
                <p className="text-xs text-muted-foreground truncate">{s.sub}</p>
              </div>
            ))}
          </div>
      )}

      {/* ── State flow (view mode only) ───────────────── */}
      {!editing && (
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
      )}

      {/* ── Main grid: always rendered ────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left col ──────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">
          {editing ? (
            <>
              <EditForm inspection={inspection} onCancel={() => setEditing(false)} />
              {checklist.length > 0 && (
                <ChecklistEditor inspection={inspection} editable={canEdit} />
              )}
              <PhotosSection inspection={inspection} editable={canEdit} />
            </>
          ) : (
            <>
              {checklist.length > 0 && (
                <ChecklistEditor
                  inspection={inspection}
                  editable={checklistEditable}
                />
              )}

              <PhotosSection inspection={inspection} editable={checklistEditable} />

              <ReportSignatureSection
                inspection={inspection}
                canEdit={canEdit}
                onUpdated={refreshInspection}
              />

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
                          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-primary/5 transition-colors"
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
            </>
          )}
        </div>

        {/* ── Right col: details sidebar (always visible) ── */}
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
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-start">
                  <span className="text-muted-foreground">Inspector</span>
                  <span className="text-right max-w-[60%] break-words">
                    {inspection.inspectorContractorName ?? inspectorName ?? "—"}
                  </span>
                </div>
                {inspection.inspectorSubmittedAt && (
                  <div className="flex justify-end">
                    <span className="text-[11px] text-emerald-600 font-medium">
                      ✓ Submitted {new Date(inspection.inspectorSubmittedAt).toLocaleDateString()}
                    </span>
                  </div>
                )}
                {inspection.inspectorContractorId && !inspection.inspectorSubmittedAt && (
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] text-amber-600">Awaiting submission</span>
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                        disabled={resending}
                        onClick={() => resendInvite(id)}
                      >
                        {resending ? "Sending…" : "Resend invite"}
                      </Button>
                    )}
                  </div>
                )}
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
                    <span>{formatDateTime(inspection.startedAt)}</span>
                  </div>
                </>
              )}
              {inspection.completedAt && (
                <>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Completed</span>
                    <span>{formatDateTime(inspection.completedAt)}</span>
                  </div>
                </>
              )}
              {inspection.approvedAt && (
                <>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Approved</span>
                    <span>{formatDateTime(inspection.approvedAt)}</span>
                  </div>
                </>
              )}
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span>{formatDateTime(inspection.createdAt)}</span>
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
                <div className="h-2 w-full rounded-full bg-primary/10 overflow-hidden flex">
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{ width: `${(passed / checklist.length) * 100}%` }}
                  />
                  <div
                    className="h-full bg-red-500 transition-all"
                    style={{ width: `${(failed / checklist.length) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground text-right">{checklistPct}% pass rate</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {assignOpen && (
        <AssignInspectorModal
          inspectionId={inspection.id}
          onClose={() => setAssignOpen(false)}
          onAssigned={refreshInspection}
        />
      )}

      {/* Cancel confirmation — shown when an inspector link has already been sent */}
      <Dialog open={cancelConfirmOpen} onOpenChange={(open) => !open && setCancelConfirmOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel this inspection?</DialogTitle>
            <DialogDescription>
              <strong>{inspectorName}</strong> has already been sent an inspector portal link.
              Cancelling will immediately invalidate that link — they will see
              &ldquo;Inspection Cancelled&rdquo; if they try to open it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelConfirmOpen(false)} disabled={transitioning}>
              Keep inspection
            </Button>
            <Button
              variant="destructive"
              loading={transitioning}
              onClick={() => {
                setCancelConfirmOpen(false);
                transition({ id: inspection.id, event: "INSPECTION_CANCELLED" });
              }}
            >
              Cancel inspection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
