"use client";

import { useState, useRef } from "react";
import {
  FileText,
  FileBadge,
  FileCheck2,
  FileImage,
  Trash2,
  Download,
  ShieldCheck,
  ShieldOff,
  Plus,
  Upload,
  AlertTriangle,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatDate, formatFileSize } from "@/utils/formatters";
import {
  useTenantDocuments,
  useUploadTenantDocument,
  useVerifyTenantDocument,
  useDeleteTenantDocument,
} from "@/hooks/useTenants";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/utils/cn";
import type { TenantDocument } from "@/types";

// ── Document type catalogue ────────────────────────────────────────────────

type DocType = TenantDocument["type"];

const DOC_TYPE_OPTIONS: { value: DocType; label: string; group: string }[] = [
  // Identity
  { value: "national_id", label: "National ID", group: "Identity" },
  { value: "passport", label: "Passport", group: "Identity" },
  { value: "driving_licence", label: "Driving Licence", group: "Identity" },
  { value: "residence_permit", label: "Residence Permit", group: "Identity" },
  // Tenancy
  {
    value: "lease_agreement" as DocType,
    label: "Signed Lease Agreement",
    group: "Tenancy",
  },
  { value: "reference_letter", label: "Reference Letter", group: "Tenancy" },
  // Financial
  {
    value: "proof_of_income",
    label: "Proof of Income / Employment Letter",
    group: "Financial",
  },
  { value: "bank_statement", label: "Bank Statement", group: "Financial" },
  // Other
  { value: "other", label: "Other", group: "Other" },
];

const TYPE_LABELS: Record<string, string> = Object.fromEntries(
  DOC_TYPE_OPTIONS.map((o) => [o.value, o.label]),
);

// ── Helpers ────────────────────────────────────────────────────────────────

function docIcon(type: DocType) {
  if (
    type === "national_id" ||
    type === "passport" ||
    type === "driving_licence" ||
    type === "residence_permit"
  )
    return FileBadge;
  if (type === ("lease_agreement" as string) || type === "reference_letter")
    return FileCheck2;
  if ((type as string).includes("image")) return FileImage;
  return FileText;
}

function isExpiringSoon(expiresAt?: string): boolean {
  if (!expiresAt) return false;
  const diff = new Date(expiresAt).getTime() - Date.now();
  return diff > 0 && diff < 60 * 24 * 3600 * 1000; // within 60 days
}

function isExpired(expiresAt?: string): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

// ── Upload dialog ──────────────────────────────────────────────────────────

interface UploadDialogProps {
  tenantId: string;
  open: boolean;
  onClose: () => void;
}

function UploadDialog({ tenantId, open, onClose }: UploadDialogProps) {
  const { mutate: upload, isPending } = useUploadTenantDocument();
  const fileRef = useRef<HTMLInputElement>(null);

  const [docType, setDocType] = useState<DocType>("national_id");
  const [docName, setDocName] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Auto-fill name when type changes (only if not manually edited)
  function handleTypeChange(value: DocType) {
    setDocType(value);
    if (!docName || DOC_TYPE_OPTIONS.some((o) => o.label === docName)) {
      setDocName(TYPE_LABELS[value] ?? "");
    }
  }

  function handleFile(f: File) {
    setFile(f);
    if (!docName) setDocName(f.name.replace(/\.[^.]+$/, ""));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  function reset() {
    setDocType("national_id");
    setDocName("");
    setExpiresAt("");
    setFile(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!docName.trim()) return;

    upload(
      {
        tenantId,
        data: {
          type: docType,
          name: docName.trim(),
          // In production the URL comes from the presigned upload;
          // in mock mode the handler generates a fake URL from any non-empty value.
          url: file ? `uploads/${tenantId}/${Date.now()}_${file.name}` : "",
          mimeType: file?.type ?? "application/pdf",
          sizeBytes: file?.size ?? 0,
          expiresAt: expiresAt || undefined,
        },
      },
      { onSuccess: handleClose },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Add Document
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type */}
          <div className="space-y-1.5">
            <Label htmlFor="docType">Document Type *</Label>
            <Select
              value={docType}
              onValueChange={(v) => handleTypeChange(v as DocType)}
            >
              <SelectTrigger id="docType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["Identity", "Tenancy", "Financial", "Other"].map((group) => (
                  <div key={group}>
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {group}
                    </div>
                    {DOC_TYPE_OPTIONS.filter((o) => o.group === group).map(
                      (o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ),
                    )}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="docName">Document Name *</Label>
            <Input
              id="docName"
              value={docName}
              onChange={(e) => setDocName(e.target.value)}
              placeholder="e.g. National ID – Front"
              required
            />
          </div>

          {/* Expiry */}
          <div className="space-y-1.5">
            <Label htmlFor="docExpiry">
              Expiry Date{" "}
              <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="docExpiry"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
            />
          </div>

          {/* File drop zone */}
          <div className="space-y-1.5">
            <Label>
              File{" "}
              <span className="text-muted-foreground">(optional in demo)</span>
            </Label>
            <div
              className={cn(
                "rounded-xl border-2 border-dashed p-6 text-center transition-colors cursor-pointer",
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50 hover:bg-muted/40",
              )}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              role="button"
              aria-label="Upload file"
            >
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              {file ? (
                <div className="flex items-center justify-center gap-2 text-sm">
                  <FileText className="h-4 w-4 text-primary" />
                  <span className="font-medium truncate max-w-xs">
                    {file.name}
                  </span>
                  <span className="text-muted-foreground">
                    {formatFileSize(file.size)}
                  </span>
                </div>
              ) : (
                <>
                  <Upload className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Drag & drop or click to select
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    PDF, JPG, PNG up to 50 MB
                  </p>
                </>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={isPending}
              disabled={!docName.trim()}
            >
              <Upload className="h-3.5 w-3.5" />
              Upload Document
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Document row ───────────────────────────────────────────────────────────

interface DocRowProps {
  doc: TenantDocument;
  tenantId: string;
  canVerify: boolean;
  canDelete: boolean;
}

function DocumentRow({ doc, tenantId, canVerify, canDelete }: DocRowProps) {
  const { mutate: verify, isPending: verifying } = useVerifyTenantDocument();
  const { mutate: remove, isPending: deleting } = useDeleteTenantDocument();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const Icon = docIcon(doc.type);
  const expiring = isExpiringSoon(doc.expiresAt);
  const expired = isExpired(doc.expiresAt);

  return (
    <div className="group flex items-start gap-3 rounded-lg border p-3 hover:bg-muted/30 transition-colors">
      {/* Icon */}
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          doc.verified ? "bg-emerald-100 dark:bg-emerald-100/40" : "bg-muted",
        )}
      >
        <Icon
          className={cn(
            "h-4 w-4",
            doc.verified ? "text-emerald-600" : "text-muted-foreground",
          )}
        />
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{doc.name}</span>
          {doc.verified ? (
            <Badge
              variant="outline"
              className="text-[10px] gap-1 text-emerald-700 border-emerald-200 bg-emerald-50 dark:bg-emerald-100/40 dark:border-emerald-200 shrink-0"
            >
              <ShieldCheck className="h-2.5 w-2.5" />
              Verified
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="text-[10px] text-amber-700 border-amber-200 bg-amber-50 dark:bg-amber-100/40 dark:border-amber-200 shrink-0"
            >
              Unverified
            </Badge>
          )}
          {expired && (
            <Badge variant="destructive" className="text-[10px] shrink-0">
              Expired
            </Badge>
          )}
          {!expired && expiring && (
            <Badge
              variant="outline"
              className="text-[10px] text-orange-700 border-orange-200 bg-orange-50 dark:bg-orange-100/40 shrink-0"
            >
              <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
              Expiring soon
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          <span className="capitalize">
            {TYPE_LABELS[doc.type] ?? doc.type.replace(/_/g, " ")}
          </span>
          {doc.sizeBytes > 0 && (
            <>
              <span>·</span>
              <span>{formatFileSize(doc.sizeBytes)}</span>
            </>
          )}
          <span>·</span>
          <span>Uploaded {formatDate(doc.uploadedAt)}</span>
          {doc.expiresAt && (
            <>
              <span>·</span>
              <span
                className={cn(
                  "flex items-center gap-0.5",
                  expired && "text-red-600 font-medium",
                )}
              >
                <Calendar className="h-3 w-3" />
                Expires {formatDate(doc.expiresAt)}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {/* Download / view */}
        {doc.url && (
          <Button
            variant="ghost"
            size="icon-sm"
            asChild
            title="View / Download"
          >
            <a href={doc.url} target="_blank" rel="noopener noreferrer">
              <Download className="h-3.5 w-3.5" />
            </a>
          </Button>
        )}

        {/* Verify toggle */}
        {canVerify && (
          <Button
            variant="ghost"
            size="icon-sm"
            loading={verifying}
            title={doc.verified ? "Unverify" : "Mark as verified"}
            onClick={() => verify({ tenantId, documentId: doc.id })}
          >
            {doc.verified ? (
              <ShieldOff className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            )}
          </Button>
        )}

        {/* Delete */}
        {canDelete && !confirmDelete && (
          <Button
            variant="ghost"
            size="icon-sm"
            title="Delete document"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        )}
        {confirmDelete && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-destructive font-medium">
              Delete?
            </span>
            <Button
              variant="destructive"
              size="sm"
              className="h-6 text-xs px-2"
              loading={deleting}
              onClick={() =>
                remove(
                  { tenantId, documentId: doc.id },
                  { onSuccess: () => setConfirmDelete(false) },
                )
              }
            >
              Yes
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs px-2"
              onClick={() => setConfirmDelete(false)}
            >
              No
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main section ───────────────────────────────────────────────────────────

interface TenantDocumentsSectionProps {
  tenantId: string;
}

export function TenantDocumentsSection({
  tenantId,
}: TenantDocumentsSectionProps) {
  const { data: documents = [], isLoading } = useTenantDocuments(tenantId);
  const { can } = usePermissions();
  const canWrite = can("tenants:write");
  const canVerify = can("tenants:write");
  const [showUpload, setShowUpload] = useState(false);

  const verifiedCount = documents.filter((d) => d.verified).length;
  const expiredCount = documents.filter((d) => isExpired(d.expiresAt)).length;
  const expiringSoon = documents.filter((d) =>
    isExpiringSoon(d.expiresAt),
  ).length;

  // Group by type category for display
  const identity = documents.filter((d) =>
    ["national_id", "passport", "driving_licence", "residence_permit"].includes(
      d.type,
    ),
  );
  const tenancy = documents.filter((d) =>
    ["lease_agreement", "reference_letter"].includes(d.type as string),
  );
  const financial = documents.filter((d) =>
    ["proof_of_income", "bank_statement"].includes(d.type),
  );
  const other = documents.filter(
    (d) =>
      !identity.includes(d) && !tenancy.includes(d) && !financial.includes(d),
  );

  const groups = [
    { label: "Identity", docs: identity },
    { label: "Tenancy", docs: tenancy },
    { label: "Financial", docs: financial },
    { label: "Other", docs: other },
  ].filter((g) => g.docs.length > 0);

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Documents
              {documents.length > 0 && (
                <span className="text-sm font-normal text-muted-foreground">
                  ({documents.length})
                </span>
              )}
            </CardTitle>
            {canWrite && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowUpload(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Document
              </Button>
            )}
          </div>

          {/* Summary chips */}
          {documents.length > 0 && (
            <div className="flex gap-2 flex-wrap mt-2">
              <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 dark:bg-emerald-100/40 rounded-full px-2 py-0.5">
                <ShieldCheck className="h-3 w-3" />
                {verifiedCount}/{documents.length} verified
              </span>
              {expiredCount > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 dark:bg-red-100/40 rounded-full px-2 py-0.5">
                  <AlertTriangle className="h-3 w-3" />
                  {expiredCount} expired
                </span>
              )}
              {expiringSoon > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-orange-700 bg-orange-50 dark:bg-orange-100/40 rounded-full px-2 py-0.5">
                  <Calendar className="h-3 w-3" />
                  {expiringSoon} expiring soon
                </span>
              )}
            </div>
          )}
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="h-16 rounded-lg bg-muted animate-pulse"
                />
              ))}
            </div>
          ) : documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                <FileText className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">No documents yet</p>
              <p className="text-xs text-muted-foreground">
                Upload IDs, signed agreements, and supporting documents.
              </p>
              {canWrite && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => setShowUpload(true)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Document
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {groups.map((group, gi) => (
                <div key={group.label}>
                  {gi > 0 && <Separator className="mb-4" />}
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    {group.label}
                  </p>
                  <div className="space-y-2">
                    {group.docs.map((doc) => (
                      <DocumentRow
                        key={doc.id}
                        doc={doc}
                        tenantId={tenantId}
                        canVerify={canVerify}
                        canDelete={canWrite}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <UploadDialog
        tenantId={tenantId}
        open={showUpload}
        onClose={() => setShowUpload(false)}
      />
    </>
  );
}
