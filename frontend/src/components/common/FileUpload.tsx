"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, X, File, CheckCircle } from "lucide-react";
import { cn } from "@/utils/cn";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatFileSize } from "@/utils/formatters";
import { MAX_FILE_SIZE_BYTES } from "@/utils/constants";
import { uploadsApi, type UploadResult } from "@/services/api/uploads";

interface UploadedFile {
  file: File;
  result: UploadResult | null;
  progress: number;
  status: "uploading" | "done" | "error";
  error?: string;
}

interface FileUploadProps {
  accept?: Record<string, string[]>;
  maxFiles?: number;
  category: "document" | "signature" | "inspection_photo" | "property_image";
  tenantId?: string;
  leaseId?: string;
  inspectionId?: string;
  /** When set, presign requests go to the public onboarding endpoint (no JWT). */
  onboardingToken?: string;
  onUpload?: (results: UploadResult[]) => void;
  className?: string;
  disabled?: boolean;
}

export function FileUpload({
  accept,
  maxFiles = 5,
  category,
  tenantId,
  leaseId,
  inspectionId,
  onboardingToken,
  onUpload,
  className,
  disabled,
}: FileUploadProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);

  const upload = useCallback(
    async (file: File): Promise<UploadResult> => {
      return uploadsApi.uploadFile(
        file,
        { category, tenantId, leaseId, inspectionId, onboardingToken },
        (progress) => {
          setFiles((prev) =>
            prev.map((f) => (f.file === file ? { ...f, progress } : f)),
          );
        },
      );
    },
    [category, tenantId, leaseId, inspectionId, onboardingToken],
  );

  const onDrop = useCallback(
    async (accepted: File[]) => {
      const newFiles: UploadedFile[] = accepted.map((f) => ({
        file: f,
        result: null,
        progress: 0,
        status: "uploading" as const,
      }));
      setFiles((prev) => [...prev, ...newFiles]);

      const results: UploadResult[] = [];
      await Promise.all(
        accepted.map(async (file) => {
          try {
            const result = await upload(file);
            results.push(result);
            setFiles((prev) =>
              prev.map((f) =>
                f.file === file ? { ...f, result, progress: 100, status: "done" } : f,
              ),
            );
          } catch {
            setFiles((prev) =>
              prev.map((f) =>
                f.file === file
                  ? { ...f, status: "error", error: "Upload failed" }
                  : f,
              ),
            );
          }
        }),
      );
      if (results.length > 0) onUpload?.(results);
    },
    [upload, onUpload],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: accept ?? {
      "application/pdf": [".pdf"],
      "image/*": [".jpg", ".jpeg", ".png", ".webp"],
    },
    maxFiles,
    maxSize: MAX_FILE_SIZE_BYTES,
    disabled,
  });

  const removeFile = (file: File) => {
    setFiles((prev) => prev.filter((f) => f.file !== file));
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div
        {...getRootProps()}
        className={cn(
          "flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer",
          isDragActive
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/50",
          disabled && "opacity-50 cursor-not-allowed",
        )}
        role="button"
        aria-label="Upload files"
      >
        <input {...getInputProps()} />
        <Upload className="mb-3 h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium">
          {isDragActive ? "Drop files here" : "Drag & drop or click to upload"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          PDF, JPG, PNG, WebP up to 50MB
        </p>
      </div>

      {files.length > 0 && (
        <ul className="space-y-2" aria-label="Uploaded files">
          {files.map(({ file, progress, status, error }) => (
            <li
              key={`${file.name}-${file.size}`}
              className="flex items-center gap-3 rounded-lg border p-3"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                {status === "done" ? (
                  <CheckCircle className="h-4 w-4 text-emerald-600" />
                ) : (
                  <File className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                  {status === "error" && (
                    <p className="text-xs text-destructive">{error}</p>
                  )}
                </div>
                {status === "uploading" && (
                  <Progress value={progress} className="mt-1 h-1" />
                )}
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => removeFile(file)}
                aria-label={`Remove ${file.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
