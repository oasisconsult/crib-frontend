"use client";

import { useCallback, useRef, useState } from "react";
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertTriangle,
  X, Download, Users, UserCheck, UserX,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { usePreviewTenantImport, useCommitTenantImport } from "@/hooks/useTenantImport";
import { tenantImportApi } from "@/services/api/tenantImport";
import type { TenantImportPreviewResponse, TenantImportResultResponse } from "@/services/api/tenantImport";

interface Props {
  onClose: () => void;
}

type Step = "upload" | "preview" | "success";

export function TenantImportModal({ onClose }: Props) {
  const [step, setStep]       = useState<Step>("upload");
  const [file, setFile]       = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<TenantImportPreviewResponse | null>(null);
  const [result,  setResult]  = useState<TenantImportResultResponse | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { mutate: previewImport, isPending: previewing } = usePreviewTenantImport();
  const { mutate: commitImport,  isPending: committing  } = useCommitTenantImport();

  const handleFile = useCallback(
    (f: File) => {
      setFile(f);
      previewImport(f, {
        onSuccess: (data) => {
          setPreview(data);
          setStep("preview");
        },
      });
    },
    [previewImport],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files[0];
      if (f?.name.endsWith(".csv")) handleFile(f);
    },
    [handleFile],
  );

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
      <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* ── Header ── */}
        <CardHeader className="flex-row items-start justify-between gap-4 pb-3">
          <div>
            <CardTitle>
              {step === "upload"  && "Import Tenants"}
              {step === "preview" && "Preview Import"}
              {step === "success" && "Import Complete"}
            </CardTitle>
            <CardDescription className="mt-1">
              {step === "upload"  && "Upload a CSV file to bulk-import tenant profiles"}
              {step === "preview" && "Review what will be imported before confirming"}
              {step === "success" && "Tenants have been added to your organisation"}
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="flex-1 overflow-y-auto space-y-4">
          {/* ── Step 1: Upload ── */}
          {step === "upload" && (
            <>
              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded-[8px] p-10 text-center cursor-pointer transition-colors",
                  dragging
                    ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20"
                    : "border-border hover:border-muted-foreground/40 hover:bg-muted/30",
                )}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
                {previewing ? (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    <p className="text-sm">Validating…</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <Upload className="h-10 w-10 opacity-40" />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Drop a CSV file here or click to browse
                      </p>
                      <p className="text-xs mt-0.5">Max 2 MB · UTF-8 encoding</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Template download */}
              <div className="flex items-center justify-between rounded-[6px] border px-4 py-3 text-sm">
                <div className="flex items-center gap-2.5">
                  <FileSpreadsheet className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="font-medium">Download CSV template</p>
                    <p className="text-xs text-muted-foreground">
                      Required: first_name, last_name, email — unit assignment optional
                    </p>
                  </div>
                </div>
                <a href="/api/v1/tenants/import/template" download="tenant_import_template.csv">
                  <Button variant="outline" size="sm">
                    <Download className="h-3.5 w-3.5" />
                    Template
                  </Button>
                </a>
              </div>

              {/* Format notes */}
              <div className="rounded-[6px] bg-muted/50 px-4 py-3 space-y-1.5 text-xs text-muted-foreground">
                <p className="font-medium text-foreground text-sm">Two import modes</p>
                <p>
                  <span className="font-medium text-foreground">Profile only</span> — leave
                  property_name and unit_name blank. Creates a tenant in invited state;
                  manager sends onboarding link separately.
                </p>
                <p>
                  <span className="font-medium text-foreground">With active lease</span> — fill
                  property_name, unit_name (must match existing). Creates tenant as activated,
                  assigns the unit, and provisions a Logto account with welcome email.
                </p>
              </div>
            </>
          )}

          {/* ── Step 2: Preview ── */}
          {step === "preview" && preview && (
            <>
              {/* Errors (hard) */}
              {preview.errors.length > 0 && (
                <div className="rounded-[6px] border border-destructive/40 bg-destructive/5 px-4 py-3 space-y-1">
                  <p className="text-sm font-medium text-destructive flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4" />
                    {preview.errors.length} error{preview.errors.length !== 1 ? "s" : ""} — fix the CSV and re-upload
                  </p>
                  <ul className="text-xs text-destructive/80 space-y-0.5 pl-5 list-disc">
                    {preview.errors.slice(0, 5).map((e, i) => (
                      <li key={i}>Row {e.row} · {e.column}: {e.message}</li>
                    ))}
                    {preview.errors.length > 5 && (
                      <li>…and {preview.errors.length - 5} more</li>
                    )}
                  </ul>
                </div>
              )}

              {/* Warnings (soft) */}
              {preview.warnings.length > 0 && (
                <div className="rounded-[6px] border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 px-4 py-3 space-y-1">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4" />
                    {preview.warnings.length} warning{preview.warnings.length !== 1 ? "s" : ""}
                  </p>
                  <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-0.5 pl-5 list-disc">
                    {preview.warnings.slice(0, 5).map((w, i) => (
                      <li key={i}>{w.email && <span className="font-medium">{w.email}: </span>}{w.message}</li>
                    ))}
                    {preview.warnings.length > 5 && (
                      <li>…and {preview.warnings.length - 5} more</li>
                    )}
                  </ul>
                </div>
              )}

              {/* Summary chips */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Total tenants",  value: preview.totalTenants, icon: Users,     color: "text-foreground" },
                  { label: "With lease",     value: preview.withLease,    icon: UserCheck,  color: "text-emerald-600" },
                  { label: "Profile only",   value: preview.profileOnly,  icon: UserX,      color: "text-amber-600" },
                ].map(({ label, value, icon: Icon, color }) => (
                  <div key={label} className="rounded-[6px] border px-3 py-2.5 text-center">
                    <Icon className={cn("h-5 w-5 mx-auto mb-1", color)} />
                    <p className="text-lg font-semibold">{value}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>

              {/* Tenant list preview */}
              {preview.tenants.length > 0 && (
                <div className="border rounded-[6px] divide-y max-h-52 overflow-y-auto text-sm">
                  {preview.tenants.map((t) => (
                    <div key={t.rowNum} className="flex items-center justify-between px-3 py-2 gap-3">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{t.firstName} {t.lastName}</p>
                        <p className="text-xs text-muted-foreground truncate">{t.email}</p>
                      </div>
                      <div className="text-right shrink-0">
                        {t.mode === "with_lease" ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 font-medium">
                            {t.propertyName} · {t.unitName}
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                            Profile only
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => { setStep("upload"); setPreview(null); setFile(null); }}>
                  Change file
                </Button>
                <Button
                  onClick={handleCommit}
                  disabled={!preview.isValid || preview.totalTenants === 0}
                  loading={committing}
                >
                  Import {preview.totalTenants} tenant{preview.totalTenants !== 1 ? "s" : ""}
                </Button>
              </div>
            </>
          )}

          {/* ── Step 3: Success ── */}
          {step === "success" && result && (
            <div className="py-6 text-center space-y-4">
              <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-500" />
              <div>
                <p className="text-lg font-semibold">Import successful!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {result.importedTenants} tenant{result.importedTenants !== 1 ? "s" : ""} imported
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto">
                <div className="rounded-[6px] border px-3 py-2 text-center">
                  <p className="text-xl font-bold text-emerald-600">{result.withLease}</p>
                  <p className="text-xs text-muted-foreground">With active lease</p>
                </div>
                <div className="rounded-[6px] border px-3 py-2 text-center">
                  <p className="text-xl font-bold text-amber-600">{result.profileOnly}</p>
                  <p className="text-xs text-muted-foreground">Profile only</p>
                </div>
              </div>
              {result.skippedTenants > 0 && (
                <p className="text-xs text-muted-foreground">
                  {result.skippedTenants} row{result.skippedTenants !== 1 ? "s" : ""} skipped (duplicates)
                </p>
              )}
              <Button onClick={onClose}>Done</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
