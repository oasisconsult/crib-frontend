"use client";

import { use, useCallback, useRef, useState } from "react";
import {
  AlertCircle, Camera, CheckCircle2, ChevronDown, ChevronUp,
  ClipboardCheck, Clock, Loader2, MapPin, SendHorizontal, Upload, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useInspectorPortal, useInspectorSubmit } from "@/hooks/useInspections";
import type { ChecklistItem } from "@/types/inspection";

interface Props {
  params: Promise<{ token: string }>;
}

const CONDITION_OPTIONS = [
  { value: "excellent", label: "Excellent", color: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  { value: "good",      label: "Good",      color: "bg-green-100 text-green-800 border-green-300" },
  { value: "fair",      label: "Fair",      color: "bg-amber-100 text-amber-800 border-amber-300" },
  { value: "poor",      label: "Poor",      color: "bg-red-100 text-red-800 border-red-300" },
  { value: "damaged",   label: "Damaged",   color: "bg-rose-100 text-rose-800 border-rose-300" },
] as const;

const TYPE_LABELS: Record<string, string> = {
  move_in: "Move-in Inspection",
  move_out: "Move-out Inspection",
  routine: "Routine Inspection",
  maintenance: "Maintenance Inspection",
  complaint: "Complaint Inspection",
};

function ConditionPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {CONDITION_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-full border px-3 py-0.5 text-xs font-medium transition-all
            ${value === opt.value
              ? `${opt.color} ring-2 ring-offset-1 ring-current`
              : "bg-white border-border text-muted-foreground hover:border-foreground/30"
            }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function PhotoUploadArea({
  token,
  urls,
  onAdd,
  onRemove,
}: {
  token: string;
  urls: string[];
  onAdd: (url: string) => void;
  onRemove: (url: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  // Maps server URL → local blob URL for photos uploaded this session.
  // The server URL (stored in photoUrls for submission) may be an internal
  // MinIO address unreachable from the browser; the blob URL always displays.
  const blobMap = useRef<Map<string, string>>(new Map());

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setUploading(true);
      try {
        for (const file of Array.from(files)) {
          const blobUrl = URL.createObjectURL(file);
          const form = new FormData();
          form.append("file", file);
          const res = await fetch(`/api/v1/upload/file/inspector/${token}`, {
            method: "POST",
            body: form,
          });
          if (res.ok) {
            const data = await res.json();
            const serverUrl: string = data.publicUrl;
            blobMap.current.set(serverUrl, blobUrl);
            onAdd(serverUrl);
          }
        }
      } finally {
        setUploading(false);
      }
    },
    [token, onAdd],
  );

  // Use local blob preview when available; fall back to server URL
  const getSrc = (url: string) => blobMap.current.get(url) ?? url;

  return (
    <div className="mt-2 space-y-2">
      {urls.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          {urls.map((url, idx) => (
            <div key={url} className="relative group">
              <img
                src={getSrc(url)}
                alt={`Photo ${idx + 1}`}
                className="w-full aspect-square object-cover rounded-md border border-border"
                loading="lazy"
              />
              <button
                type="button"
                onClick={() => onRemove(url)}
                className="absolute top-1 right-1 rounded-full bg-black/60 text-white p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Remove photo"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={uploading}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-md px-3 py-2 w-full justify-center transition-colors hover:border-foreground/30 disabled:opacity-50"
      >
        {uploading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Camera className="h-3.5 w-3.5" />
        )}
        {uploading ? "Uploading…" : "Add photos"}
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}

function ChecklistItemEditor({
  item,
  token,
  onChange,
}: {
  item: ChecklistItem;
  token: string;
  onChange: (updated: ChecklistItem) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const addPhoto = (url: string) => onChange({ ...item, photoUrls: [...(item.photoUrls ?? []), url] });
  const removePhoto = (url: string) => onChange({ ...item, photoUrls: (item.photoUrls ?? []).filter((u) => u !== url) });

  const hasIssue = item.condition === "poor" || item.condition === "damaged";
  const isComplete = !!item.condition;

  return (
    <div className={`rounded-lg border transition-colors ${hasIssue ? "border-red-200 bg-red-50/30" : "border-border bg-card"}`}>
      <button
        type="button"
        className="w-full flex items-start gap-3 p-3 text-left"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex-shrink-0 transition-colors ${
          isComplete
            ? hasIssue
              ? "bg-red-500 border-red-500"
              : "bg-emerald-500 border-emerald-500"
            : "border-muted-foreground/40"
        }`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground leading-tight">{item.description}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{item.area}</p>
          {item.condition && (
            <span className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full font-medium capitalize
              ${CONDITION_OPTIONS.find((o) => o.value === item.condition)?.color ?? "bg-gray-100 text-gray-600"}`}>
              {item.condition}
            </span>
          )}
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /> : <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-border/50 pt-3">
          <div>
            <Label className="text-xs font-medium">Condition</Label>
            <ConditionPicker
              value={item.condition ?? null}
              onChange={(v) => onChange({ ...item, condition: v as ChecklistItem["condition"] })}
            />
          </div>
          <div>
            <Label className="text-xs font-medium">Notes</Label>
            <Textarea
              placeholder="Describe findings, defects, or observations…"
              value={item.notes ?? ""}
              onChange={(e) => onChange({ ...item, notes: e.target.value })}
              className="mt-1 text-sm resize-none"
              rows={2}
            />
          </div>
          <div>
            <Label className="text-xs font-medium">Photos</Label>
            <PhotoUploadArea
              token={token}
              urls={item.photoUrls ?? []}
              onAdd={addPhoto}
              onRemove={removePhoto}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function InspectorPortalPage({ params }: Props) {
  const { token } = use(params);
  const { data: inspection, isLoading, error } = useInspectorPortal(token);
  const submitMutation = useInspectorSubmit(token);

  const [checklist, setChecklist] = useState<ChecklistItem[] | null>(null);
  const [overallCondition, setOverallCondition] = useState<string>("");
  const [summary, setSummary] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [generalPhotos, setGeneralPhotos] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const effectiveChecklist = checklist ?? (inspection?.checklist as ChecklistItem[] ?? []);

  const updateItem = (idx: number, updated: ChecklistItem) => {
    const base = checklist ?? (inspection?.checklist as ChecklistItem[] ?? []);
    const next = [...base];
    next[idx] = updated;
    setChecklist(next);
  };

  const completedCount = effectiveChecklist.filter((i) => i.condition).length;
  const progress = effectiveChecklist.length > 0 ? Math.round((completedCount / effectiveChecklist.length) * 100) : 0;

  const handleSubmit = async () => {
    if (!inspection) return;
    await submitMutation.mutateAsync({
      checklist: effectiveChecklist,
      overallCondition: overallCondition || undefined,
      summary: summary || undefined,
      recommendations: recommendations || undefined,
      photoUrls: generalPhotos,
    });
    setSubmitted(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !inspection) {
    const is410 = (error as { status?: number })?.status === 410;
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-8 space-y-3">
            <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
            <h2 className="text-lg font-semibold">
              {is410 ? "Link Expired" : "Inspection Not Found"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {is410
                ? "This inspector link has expired. Please contact the property manager to send a new one."
                : "This link is invalid or the inspection no longer exists."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const alreadySubmitted = submitted || !!inspection.inspectorSubmittedAt;

  if (alreadySubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-8 space-y-3">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
            <h2 className="text-lg font-semibold">Inspection Submitted</h2>
            <p className="text-sm text-muted-foreground">
              Your findings have been submitted. The property manager has been notified and will review your report.
            </p>
            {inspection.inspectorSubmittedAt && (
              <p className="text-xs text-muted-foreground">
                Submitted: {new Date(inspection.inspectorSubmittedAt).toLocaleString()}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <div className="bg-white border-b border-border sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <ClipboardCheck className="h-5 w-5 text-primary flex-shrink-0" />
            <span className="font-semibold text-sm truncate">
              {TYPE_LABELS[inspection.type] ?? inspection.type.replace(/_/g, " ")}
            </span>
          </div>
          <Badge variant="outline" className="text-[11px] flex-shrink-0">
            {inspection.reference ?? inspection.id.slice(0, 8).toUpperCase()}
          </Badge>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* Property info */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="text-sm space-y-0.5">
                <p className="font-medium">
                  {inspection.unitName
                    ? `${inspection.unitName} — ${inspection.propertyName}`
                    : inspection.propertyName}
                </p>
                {inspection.propertyAddress && (
                  <p className="text-muted-foreground text-xs">{inspection.propertyAddress}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>
                {new Date(inspection.scheduledDate).toLocaleDateString("en-GB", {
                  weekday: "long", day: "numeric", month: "long", year: "numeric",
                })}
                {inspection.scheduledTimeSlot && ` · ${inspection.scheduledTimeSlot}`}
              </span>
            </div>
            {inspection.inspectorName && (
              <p className="mt-2 text-xs text-muted-foreground">
                Inspector: <span className="font-medium text-foreground">{inspection.inspectorName}</span>
              </p>
            )}
          </CardContent>
        </Card>

        {/* Progress bar */}
        {effectiveChecklist.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Checklist progress</span>
              <span>{completedCount} / {effectiveChecklist.length} items</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Checklist */}
        {effectiveChecklist.length > 0 && (
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold">Checklist Items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pb-4">
              {effectiveChecklist.map((item, idx) => (
                <ChecklistItemEditor
                  key={item.id ?? idx}
                  item={item}
                  token={token}
                  onChange={(updated) => updateItem(idx, updated)}
                />
              ))}
            </CardContent>
          </Card>
        )}

        {/* Overall assessment */}
        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-semibold">Overall Assessment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pb-4">
            <div>
              <Label className="text-xs font-medium">Overall Condition</Label>
              <ConditionPicker value={overallCondition || null} onChange={setOverallCondition} />
            </div>
            <div>
              <Label className="text-xs font-medium">Summary</Label>
              <Textarea
                placeholder="Overall summary of the inspection findings…"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                className="mt-1 text-sm resize-none"
                rows={3}
              />
            </div>
            <div>
              <Label className="text-xs font-medium">Recommendations</Label>
              <Textarea
                placeholder="Recommended repairs, maintenance actions, or follow-ups…"
                value={recommendations}
                onChange={(e) => setRecommendations(e.target.value)}
                className="mt-1 text-sm resize-none"
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* General photos */}
        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-semibold">General Photos</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <PhotoUploadArea
              token={token}
              urls={generalPhotos}
              onAdd={(url) => setGeneralPhotos((prev) => [...prev, url])}
              onRemove={(url) => setGeneralPhotos((prev) => prev.filter((u) => u !== url))}
            />
          </CardContent>
        </Card>

        <Separator />

        {/* Submit */}
        <div className="pb-8 space-y-3">
          <p className="text-xs text-muted-foreground text-center">
            By submitting, you confirm these findings are accurate to the best of your knowledge.
            The property manager will be notified immediately.
          </p>
          <Button
            className="w-full"
            size="lg"
            onClick={handleSubmit}
            disabled={submitMutation.isPending || completedCount === 0}
          >
            {submitMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <SendHorizontal className="h-4 w-4 mr-2" />
            )}
            {submitMutation.isPending ? "Submitting…" : "Submit Inspection Report"}
          </Button>
          {completedCount === 0 && effectiveChecklist.length > 0 && (
            <p className="text-xs text-center text-muted-foreground">
              Please assess at least one checklist item before submitting.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
