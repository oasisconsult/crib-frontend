"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatDate } from "@/utils/formatters";
import type { AuditLogEntry } from "@/services/api/auditLogs";

interface Props {
  entry: AuditLogEntry | null;
  open: boolean;
  onClose: () => void;
}

const ACTION_COLORS: Record<string, string> = {
  created:   "bg-green-100 text-green-800",
  deleted:   "bg-red-100 text-red-800",
  updated:   "bg-blue-100 text-blue-800",
  approved:  "bg-teal-100 text-teal-800",
  rejected:  "bg-orange-100 text-orange-800",
  confirmed: "bg-purple-100 text-purple-800",
  refunded:  "bg-yellow-100 text-yellow-800",
  activated: "bg-emerald-100 text-emerald-800",
  terminated:"bg-rose-100 text-rose-800",
  expired:   "bg-gray-100 text-gray-700",
};

function actionBadgeClass(action: string) {
  const verb = action.split(".").pop() ?? action;
  return ACTION_COLORS[verb] ?? "bg-muted text-muted-foreground";
}

function formatActionLabel(action: string) {
  return action.replace(".", " — ").replace(/_/g, " ");
}

export function AuditLogDrawer({ entry, open, onClose }: Props) {
  if (!entry) return null;

  const hasChanges = Object.keys(entry.changes).length > 0;
  const hasEventData =
    Object.keys(entry.eventData).length > 0 &&
    // filter out keys already shown in header
    Object.keys(entry.eventData).some(
      (k) => !["unit_id", "tenant_id", "property_id"].includes(k),
    );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <Badge className={actionBadgeClass(entry.action)}>
              {formatActionLabel(entry.action)}
            </Badge>
            <span className="text-sm font-normal text-muted-foreground">
              {formatDate(entry.createdAt)}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto space-y-5 pr-1 flex-1">
          {/* ── Actor ──────────────────────────────────────────────────── */}
          <section aria-labelledby="audit-actor-heading">
            <h3
              id="audit-actor-heading"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2"
            >
              Actor
            </h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Name</dt>
              <dd>{entry.actorName ?? "Unknown"}</dd>
              {entry.actorRole && (
                <>
                  <dt className="text-muted-foreground">Role</dt>
                  <dd className="capitalize">{entry.actorRole}</dd>
                </>
              )}
              {entry.ipAddress && (
                <>
                  <dt className="text-muted-foreground">IP</dt>
                  <dd className="font-mono text-xs">{entry.ipAddress}</dd>
                </>
              )}
              {entry.requestId && (
                <>
                  <dt className="text-muted-foreground">Request ID</dt>
                  <dd className="font-mono text-xs truncate">{entry.requestId}</dd>
                </>
              )}
            </dl>
          </section>

          <Separator />

          {/* ── Resource ───────────────────────────────────────────────── */}
          <section aria-labelledby="audit-resource-heading">
            <h3
              id="audit-resource-heading"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2"
            >
              Resource
            </h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Type</dt>
              <dd className="capitalize">{entry.resourceType}</dd>
              {entry.resourceLabel && (
                <>
                  <dt className="text-muted-foreground">Name</dt>
                  <dd>{entry.resourceLabel}</dd>
                </>
              )}
              {entry.resourceId && (
                <>
                  <dt className="text-muted-foreground">ID</dt>
                  <dd className="font-mono text-xs break-all">{entry.resourceId}</dd>
                </>
              )}
            </dl>
          </section>

          {/* ── Changes diff ───────────────────────────────────────────── */}
          {hasChanges && (
            <>
              <Separator />
              <section aria-labelledby="audit-changes-heading">
                <h3
                  id="audit-changes-heading"
                  className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2"
                >
                  Changes
                </h3>
                <table className="w-full text-sm border-collapse" role="table">
                  <thead>
                    <tr className="text-left text-muted-foreground text-xs">
                      <th className="pb-1 font-medium w-1/4">Field</th>
                      <th className="pb-1 font-medium w-[37.5%]">Before</th>
                      <th className="pb-1 font-medium w-[37.5%]">After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(entry.changes).map(([field, diff]) => (
                      <tr key={field} className="border-t border-border">
                        <td className="py-1.5 capitalize text-muted-foreground pr-2">
                          {field.replace(/_/g, " ")}
                        </td>
                        <td className="py-1.5 pr-2 font-mono text-xs break-all text-destructive">
                          {diff.before != null ? String(diff.before) : "—"}
                        </td>
                        <td className="py-1.5 font-mono text-xs break-all text-emerald-700">
                          {diff.after != null ? String(diff.after) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </>
          )}

          {/* ── Extra metadata ─────────────────────────────────────────── */}
          {hasEventData && (
            <>
              <Separator />
              <section aria-labelledby="audit-metadata-heading">
                <h3
                  id="audit-metadata-heading"
                  className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2"
                >
                  Details
                </h3>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                  {Object.entries(entry.eventData)
                    .filter(([k]) => !["unit_id", "tenant_id", "property_id"].includes(k))
                    .map(([k, v]) => (
                      <>
                        <dt key={`dt-${k}`} className="text-muted-foreground capitalize">
                          {k.replace(/_/g, " ")}
                        </dt>
                        <dd key={`dd-${k}`} className="break-all">
                          {v != null ? String(v) : "—"}
                        </dd>
                      </>
                    ))}
                </dl>
              </section>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
