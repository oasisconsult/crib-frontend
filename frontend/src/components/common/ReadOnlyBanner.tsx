"use client";

import { Eye } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";

/**
 * Renders a subtle notice when the current user is an agency-managed landlord
 * with read-only access. Mount this at the top of any page that has write actions.
 */
export function ReadOnlyBanner() {
  const { isReadOnly } = usePermissions();

  if (!isReadOnly) return null;

  return (
    <div className="flex items-center gap-2.5 rounded-[6px] border border-amber-200 bg-amber-50 dark:border-amber-800/60 dark:bg-amber-950/20 px-4 py-2.5 mb-4 text-sm text-amber-800 dark:text-amber-300">
      <Eye className="h-4 w-4 shrink-0" />
      <span>
        Your properties are managed by an agency. You have <strong>view-only</strong>{" "}
        access — contact your agency to make changes.
      </span>
    </div>
  );
}
