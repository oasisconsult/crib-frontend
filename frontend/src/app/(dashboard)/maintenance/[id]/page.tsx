"use client";

import { use, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  Check,
  Wrench,
  AlertTriangle,
  Building2,
  Home,
  Calendar,
  Edit,
  ImageIcon,
  Loader2,
  Trash2,
  X,
  Save,
  CheckCircle,
  XCircle,
  Play,
  UserCheck,
  HardHat,
  Mail,
  Phone,
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
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { PageSkeleton } from "@/components/common/LoadingSkeleton";
import { formatDate, formatDateTime, formatCurrency } from "@/utils/formatters";
import {
  useMaintenanceIssue,
  useUpdateMaintenanceIssue,
  useTransitionMaintenanceIssue,
  useContractors,
} from "@/hooks/useInspections";
import { useProperty } from "@/hooks/useProperties";
import { usePermissions } from "@/hooks/usePermissions";
import { uploadsApi } from "@/services/api/uploads";
import { toast } from "@/store/useUIStore";
import { cn } from "@/utils/cn";
import {
  MAINTENANCE_STATE_DISPLAY,
  MAINTENANCE_TRANSITIONS,
  type MaintenanceState,
  type MaintenanceEvent,
} from "@/types/states";
import type { Contractor, MaintenanceIssue } from "@/types";

interface Props {
  params: Promise<{ id: string }>;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const CATEGORIES = [
  "plumbing", "electrical", "structural", "appliance", "pest", "security", "other",
] as const;

const PRIORITIES = [
  { value: "urgent", label: "Urgent", color: "text-red-700 bg-red-50 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800" },
  { value: "high",   label: "High",   color: "text-orange-700 bg-orange-50 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800" },
  { value: "medium", label: "Medium", color: "text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800" },
  { value: "low",    label: "Low",    color: "text-teal-700 bg-teal-50 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800" },
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

// ── Photo section ────────────────────────────────────────────────────────────

const _PHOTO_KEY_PREFIXES = [
  "inspection_photo/",
  "inspections/",
  "documents/",
  "signatures/",
  "properties/",
  "payment_receipt/",
];

function toDisplayUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("/api/v1/upload/") || url.startsWith("/api/upload/local/")) return url;
  for (const prefix of _PHOTO_KEY_PREFIXES) {
    const idx = url.indexOf(prefix);
    if (idx !== -1) return `/api/v1/upload/serve/${url.slice(idx)}`;
  }
  return url;
}

function PhotoSection({
  issue,
  canEdit,
}: {
  issue: MaintenanceIssue;
  canEdit: boolean;
}) {
  const { mutate: update } = useUpdateMaintenanceIssue();
  const [photos, setPhotos] = useState<string[]>(issue.photoUrls ?? []);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    e.target.value = "";
    setUploading(true);
    try {
      const results = await Promise.all(
        files.map((f) => uploadsApi.uploadFile(f, { category: "inspection_photo" })),
      );
      const urls = results.map((r) => r.url);
      const next = [...photos, ...urls];
      setPhotos(next);
      update({ id: issue.id, data: { photoUrls: next } });
    } catch {
      toast.error("Failed to upload photos");
    } finally {
      setUploading(false);
    }
  }

  function handleRemove(url: string) {
    const next = photos.filter((p) => p !== url);
    setPhotos(next);
    update({ id: issue.id, data: { photoUrls: next } });
  }

  if (!canEdit && photos.length === 0) return null;

  if (canEdit && photos.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-[6px] border border-dashed bg-muted/20 px-4 py-3">
        <Camera className="h-4 w-4 text-muted-foreground/50 shrink-0" />
        <span className="text-sm text-muted-foreground">Photos</span>
        <div className="flex items-center gap-2 ml-auto">
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={handleFiles} disabled={uploading} />
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline underline-offset-2 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
            Camera
          </button>
          <input ref={galleryRef} type="file" accept="image/*" multiple className="sr-only" onChange={handleFiles} disabled={uploading} />
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline underline-offset-2 disabled:opacity-50"
          >
            <ImageIcon className="h-3 w-3" />
            Gallery
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
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
            {canEdit && (
              <div className="flex items-center gap-2">
                <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={handleFiles} disabled={uploading} />
                <button
                  type="button"
                  onClick={() => cameraRef.current?.click()}
                  disabled={uploading}
                  className="inline-flex items-center gap-1.5 rounded-[5px] border border-input bg-background px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-accent transition-colors disabled:opacity-50"
                >
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                  {uploading ? "Uploading…" : "Take Photo"}
                </button>
                <input ref={galleryRef} type="file" accept="image/*" multiple className="sr-only" onChange={handleFiles} disabled={uploading} />
                <button
                  type="button"
                  onClick={() => galleryRef.current?.click()}
                  disabled={uploading}
                  className="inline-flex items-center gap-1.5 rounded-[5px] border border-input bg-background px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-accent transition-colors disabled:opacity-50"
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  Add from Gallery
                </button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {photos.map((url) => (
              <div key={url} className="group relative aspect-square rounded-[6px] overflow-hidden bg-muted border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={toDisplayUrl(url)}
                  alt="Issue photo"
                  className="w-full h-full object-cover cursor-pointer transition-opacity group-hover:opacity-90"
                  onClick={() => setLightbox(url)}
                />
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => handleRemove(url)}
                    className="absolute top-1 right-1 hidden group-hover:flex items-center justify-center h-6 w-6 rounded-full bg-black/60 text-white hover:bg-destructive transition-colors"
                    aria-label="Remove photo"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={toDisplayUrl(lightbox)}
            alt="Photo preview"
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white"
            onClick={() => setLightbox(null)}
            aria-label="Close"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
      )}
    </>
  );
}

// ── Assign modal (contractor picker) ─────────────────────────────────────────

function AssignModal({
  open,
  onClose,
  issueId,
  issueCategory,
}: {
  open: boolean;
  onClose: () => void;
  issueId: string;
  issueCategory: string;
}) {
  const [contractorId, setContractorId] = useState("none");
  const [freeText, setFreeText]         = useState("");

  const { data: contractorsPage, isLoading } = useContractors({
    specialty: issueCategory !== "other" ? issueCategory : undefined,
    isActive: true,
  });
  const contractors = contractorsPage?.data ?? [];

  const { mutate: transition, isPending } = useTransitionMaintenanceIssue();

  const selected = contractors.find((c) => c.id === contractorId);

  function handleAssign() {
    if (contractorId === "none" && !freeText.trim()) return;
    transition(
      {
        id: issueId,
        event: "ISSUE_ASSIGNED",
        payload: contractorId !== "none"
          ? { contractorId }
          : { assignedTo: freeText.trim() },
      },
      { onSuccess: onClose },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm" aria-describedby="assign-dialog-description">
        <DialogHeader>
          <DialogTitle>Assign Contractor</DialogTitle>
          <DialogDescription id="assign-dialog-description">
            Pick a contractor from your directory or enter a name manually.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="assign-contractor">From directory</Label>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading contractors…</p>
            ) : (
              <Select value={contractorId} onValueChange={(v) => { setContractorId(v); setFreeText(""); }}>
                <SelectTrigger id="assign-contractor" aria-label="Select contractor from directory">
                  <SelectValue placeholder="Select a contractor…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {contractors.map((c: Contractor) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="font-medium">{c.name}</span>
                      {c.specialty && (
                        <span className="ml-1.5 text-xs text-muted-foreground capitalize">({c.specialty})</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Show selected contractor contact info */}
          {selected && (selected.phone || selected.email) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {selected.phone && (
                <a href={`tel:${selected.phone}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
                  <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {selected.phone}
                </a>
              )}
              {selected.email && (
                <a href={`mailto:${selected.email}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
                  <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {selected.email}
                </a>
              )}
            </div>
          )}

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">or enter name manually</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="assign-free">Name</Label>
            <Input
              id="assign-free"
              value={freeText}
              onChange={(e) => { setFreeText(e.target.value); setContractorId("none"); }}
              placeholder="Contractor or staff name"
              aria-label="Enter contractor name manually"
            />
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button
            onClick={handleAssign}
            loading={isPending}
            disabled={contractorId === "none" && !freeText.trim()}
          >
            <HardHat className="h-4 w-4" />
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StateBadge({ state }: { state: string }) {
  const cfg = MAINTENANCE_STATE_DISPLAY[state as MaintenanceState] ?? {
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
  const [editing, setEditing]   = useState(false);
  const [assigning, setAssigning] = useState(false);

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
              <span>Reported {formatDateTime(issue.reportedAt ?? issue.createdAt)}</span>
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
                loading={transitioning && action.event !== "ISSUE_ASSIGNED"}
                onClick={() =>
                  action.event === "ISSUE_ASSIGNED"
                    ? setAssigning(true)
                    : transition({ id: issue.id, event: action.event })
                }
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
                  <span>{formatDateTime(issue.reportedAt ?? issue.createdAt)}</span>
                </div>
                {issue.assignedAt && (
                  <>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Assigned</span>
                      <span>{formatDateTime(issue.assignedAt)}</span>
                    </div>
                  </>
                )}
                {issue.startedAt && (
                  <>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Started</span>
                      <span>{formatDateTime(issue.startedAt)}</span>
                    </div>
                  </>
                )}
                {issue.resolvedAt && (
                  <>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Resolved</span>
                      <span>{formatDateTime(issue.resolvedAt)}</span>
                    </div>
                  </>
                )}
                {issue.closedAt && (
                  <>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Closed</span>
                      <span>{formatDateTime(issue.closedAt)}</span>
                    </div>
                  </>
                )}
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last Updated</span>
                  <span>{formatDateTime(issue.updatedAt)}</span>
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

          {/* ── Completion photos ─────────────────────────── */}
          <PhotoSection issue={issue} canEdit={canEdit} />

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

      {/* ── Assign modal ──────────────────────────────────── */}
      {assigning && (
        <AssignModal
          open={assigning}
          onClose={() => setAssigning(false)}
          issueId={issue.id}
          issueCategory={issue.category}
        />
      )}
    </div>
  );
}
