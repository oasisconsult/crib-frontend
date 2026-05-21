"use client";

import { Home, Info } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";

/**
 * CaretakerBanner
 *
 * Shown at the top of every dashboard page when the logged-in user is a
 * caretaker. Clarifies who they are acting on behalf of so there is no
 * confusion about which landlord's properties they are seeing.
 *
 * Rendered by the dashboard layout when isCaretaker=true.
 */
export function CaretakerBanner() {
  const { isCaretaker, caretakerMeta, caretakerOperationsOnly } = usePermissions();

  if (!isCaretaker || !caretakerMeta) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 px-4 md:px-7 py-2.5 bg-amber-50 dark:bg-amber-500/10 border-b border-amber-200 dark:border-amber-500/25 text-sm"
    >
      <div
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-200 dark:bg-amber-500/25"
        aria-hidden="true"
      >
        <Home className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400" />
      </div>
      <p className="text-amber-800 dark:text-amber-300 flex-1 min-w-0">
        You are managing properties on behalf of{" "}
        <span className="font-semibold">{caretakerMeta.ownerName}</span>.
        {caretakerOperationsOnly && (
          <span className="ml-1.5 text-amber-600 dark:text-amber-400">
            · Operations access only (no financial data).
          </span>
        )}
      </p>
      {caretakerOperationsOnly && (
        <div
          title="You have operations access only. Payment amounts and analytics are not visible to you."
          className="shrink-0 cursor-help"
        >
          <Info className="h-4 w-4 text-amber-500" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}
