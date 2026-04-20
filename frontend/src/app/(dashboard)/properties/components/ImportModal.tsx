"use client";

import { useCallback, useRef, useState } from "react";
import {
  AlertCircle, AlertTriangle, CheckCircle2, Download,
  FileSpreadsheet, Loader2, Upload, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { usePreviewImport, useCommitImport } from "@/hooks/usePropertyImport";
import { propertyImportApi } from "@/services/api/propertyImport";
import type { ImportPreviewResponse, ImportResultResponse } from "@/services/api/propertyImport";
import { cn } from "@/utils/cn";

type Step = "upload" | "preview" | "success";

interface Props {
  onClose: () => void;
}

export function ImportModal({ onClose }: Props) {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [result, setResult] = useState<ImportResultResponse | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { mutate: previewImport, isPending: previewing } = usePreviewImport();
  const { mutate: commitImport, isPending: committing } = useCommitImport();

  const handleFile = useCallback(
    (f: File) => {
      if (!f.name.toLowerCase().endsWith(".csv")) return;
      setFile(f);
      previewImport(f, {
        onSuccess: (data) => {
          setPreview(data);
          setStep("preview");
        },
        onError: () => {
          // error displayed inline via preview errors
        },
      });
    },
    [previewImport],
  );

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  function handleCommit() {
    if (!file) return;
    commitImport(file, {
      onSuccess: (data) => {
        setResult(data);
        setStep("success");
      },
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              {step === "upload" && "Bulk Import Properties"}
              {step === "preview" && "Import Preview"}
              {step === "success" && "Import Complete"}
            </CardTitle>
            <CardDescription className="mt-0.5">
              {step === "upload" && "Upload a CSV file to import multiple properties and units at once."}
              {step === "preview" && "Review the properties that will be imported."}
              {step === "success" && "Your properties have been imported successfully."}
            </CardDescription>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-sm text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* ── Step indicator ── */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {(["upload", "preview", "success"] as Step[]).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                {i > 0 && <div className="h-px w-6 bg-border" />}
                <span
                  className={cn(
                    "font-medium capitalize",
                    step === s ? "text-primary" : step === "success" || (step === "preview" && s === "upload") ? "text-emerald-600 dark:text-emerald-400" : "",
                  )}
                >
                  {i + 1}. {s}
                </span>
              </div>
            ))}
          </div>

          {/* ── Upload step ── */}
          {step === "upload" && (
            <div className="space-y-4">
              {/* Template download */}
              <div className="flex items-center justify-between rounded-[6px] bg-muted/50 px-4 py-3 text-sm">
                <span className="text-muted-foreground">Need a template? Download and fill it in.</span>
                <a
                  href="/api/v1/properties/import/template"
                  download="property_import_template.csv"
                  className="inline-flex items-center gap-1.5 text-primary hover:underline font-medium"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download template
                </a>
              </div>

              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "flex flex-col items-center justify-center gap-3 rounded-[8px] border-2 border-dashed cursor-pointer transition-colors py-12",
                  dragOver
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50 hover:bg-muted/30",
                )}
                role="button"
                tabIndex={0}
                aria-label="Upload CSV file"
                onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
              >
                <Upload className="h-8 w-8 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-sm font-medium">
                    {file ? file.name : "Drop your CSV here, or click to browse"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">CSV files only · Max 2 MB · Up to 500 rows</p>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="sr-only"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />

              {previewing && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Parsing file…
                </div>
              )}
            </div>
          )}

          {/* ── Preview step ── */}
          {step === "preview" && preview && (
            <div className="space-y-4">
              {/* Summary chips */}
              <div className="flex flex-wrap gap-3">
                <StatChip label="Properties" value={preview.totalProperties} colour="blue" />
                <StatChip label="Units" value={preview.totalUnits} colour="teal" />
                {preview.warnings.length > 0 && (
                  <StatChip label="Skipped" value={preview.warnings.length} colour="amber" />
                )}
                {preview.errors.length > 0 && (
                  <StatChip label="Errors" value={preview.errors.length} colour="red" />
                )}
              </div>

              {/* Errors */}
              {preview.errors.length > 0 && (
                <div className="rounded-[6px] border border-destructive/30 bg-destructive/5 p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-destructive flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5" /> Validation errors — fix and re-upload
                  </p>
                  {preview.errors.map((e, i) => (
                    <p key={i} className="text-xs text-destructive/80">
                      Row {e.row} · <span className="font-medium">{e.column}</span>: {e.message}
                    </p>
                  ))}
                </div>
              )}

              {/* Warnings */}
              {preview.warnings.length > 0 && (
                <div className="rounded-[6px] border border-amber-300/40 bg-amber-50/60 dark:bg-amber-950/20 p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" /> These properties will be skipped
                  </p>
                  {preview.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-amber-700 dark:text-amber-400/80">
                      <span className="font-medium">{w.propertyName}</span>: {w.message}
                    </p>
                  ))}
                </div>
              )}

              {/* Property list */}
              {preview.properties.length > 0 && (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {preview.properties.map((p, i) => (
                    <PropertyPreviewCard key={i} property={p} isSkipped={preview.warnings.some((w) => w.propertyName === p.name)} />
                  ))}
                </div>
              )}

              <div className="flex justify-between gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => { setStep("upload"); setFile(null); setPreview(null); }}
                >
                  Change file
                </Button>
                <Button
                  onClick={handleCommit}
                  disabled={!preview.isValid || preview.totalProperties === 0}
                  loading={committing}
                >
                  Import {preview.totalProperties} {preview.totalProperties === 1 ? "property" : "properties"}
                </Button>
              </div>
            </div>
          )}

          {/* ── Success step ── */}
          {step === "success" && result && (
            <div className="space-y-4 py-4 text-center">
              <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto" />
              <div>
                <p className="text-lg font-semibold">Import successful!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {result.importedProperties} {result.importedProperties === 1 ? "property" : "properties"} and{" "}
                  {result.importedUnits} {result.importedUnits === 1 ? "unit" : "units"} added.
                  {result.skippedProperties > 0 && ` ${result.skippedProperties} skipped (duplicates).`}
                </p>
              </div>
              {result.warnings.length > 0 && (
                <div className="text-left rounded-[6px] border border-amber-300/40 bg-amber-50/60 dark:bg-amber-950/20 p-3 space-y-1">
                  {result.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-amber-700 dark:text-amber-400/80">
                      <span className="font-medium">{w.propertyName}</span>: {w.message}
                    </p>
                  ))}
                </div>
              )}
              <Button onClick={onClose} className="mt-2">Done</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatChip({ label, value, colour }: { label: string; value: number; colour: "blue" | "teal" | "amber" | "red" }) {
  const styles = {
    blue:  "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400",
    teal:  "bg-teal-50 text-teal-700 dark:bg-teal-950/30 dark:text-teal-400",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
    red:   "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400",
  };
  return (
    <div className={cn("rounded-[6px] px-3 py-1.5 text-center", styles[colour])}>
      <p className="text-lg font-bold leading-none">{value}</p>
      <p className="text-xs mt-0.5">{label}</p>
    </div>
  );
}

function PropertyPreviewCard({
  property,
  isSkipped,
}: {
  property: import("@/services/api/propertyImport").PropertyPreview;
  isSkipped: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className={cn(
        "rounded-[6px] border px-3 py-2.5 text-sm",
        isSkipped ? "border-amber-200/60 bg-amber-50/40 dark:bg-amber-950/10 opacity-70" : "border-border",
      )}
    >
      <div
        className="flex items-center justify-between cursor-pointer gap-2"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium truncate">{property.name}</span>
          {isSkipped && (
            <span className="shrink-0 text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 px-1.5 py-0.5 rounded-full">
              skip
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
          <span>{property.unitCount} units</span>
          <span className="capitalize">{property.type}</span>
          <span>{expanded ? "▲" : "▼"}</span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-0.5">{property.address}</p>
      {expanded && property.units.length > 0 && (
        <div className="mt-2 divide-y divide-border/50 border-t border-border/50 pt-2">
          {property.units.map((u, i) => (
            <div key={i} className="flex items-center justify-between py-1.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{u.name}</span>
              <span>{u.bedrooms}bd · {u.bathrooms}ba</span>
              <span className="font-medium text-foreground">
                {u.currency} {u.monthlyRent.toLocaleString()}
              </span>
              <span className="capitalize">{u.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
