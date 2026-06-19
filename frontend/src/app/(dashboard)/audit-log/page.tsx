"use client";

import { useState, useMemo } from "react";
import { ScrollText, Lock } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { DataTable, type Column } from "@/components/common/DataTable";
import { FilterBar } from "@/components/common/FilterBar";
import { FilterPanel, type ActiveFilters, type FilterField } from "@/components/common/FilterPanel";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AuditLogDrawer } from "@/components/audit/AuditLogDrawer";
import { useAuditLogs } from "@/hooks/useAuditLogs";
import { useCurrentSubscription } from "@/hooks/useSubscription";
import { usePermissions } from "@/hooks/usePermissions";
import { formatDate } from "@/utils/formatters";
import { useRouter } from "next/navigation";
import type { AuditLogEntry } from "@/services/api/auditLogs";

const PAGE_SIZE = 50;

const RESOURCE_TYPES = [
  { label: "Property",     value: "property" },
  { label: "Unit",         value: "unit" },
  { label: "Lease",        value: "lease" },
  { label: "Tenant",       value: "tenant" },
  { label: "Payment",      value: "payment" },
  { label: "Organisation", value: "organisation" },
];

const ACTIONS = [
  { label: "Created",    value: "created" },
  { label: "Updated",    value: "updated" },
  { label: "Deleted",    value: "deleted" },
  { label: "Approved",   value: "approved" },
  { label: "Rejected",   value: "rejected" },
  { label: "Activated",  value: "activated" },
  { label: "Terminated", value: "terminated" },
  { label: "Confirmed",  value: "confirmed" },
  { label: "Refunded",   value: "refunded" },
];

const FILTER_FIELDS: FilterField[] = [
  {
    key: "resourceType",
    label: "Resource Type",
    options: RESOURCE_TYPES,
  },
  {
    key: "action",
    label: "Action",
    options: ACTIONS,
  },
];

const ACTION_COLORS: Record<string, string> = {
  created:   "bg-green-100 text-green-800 border-green-200",
  deleted:   "bg-red-100 text-red-800 border-red-200",
  updated:   "bg-blue-100 text-blue-800 border-blue-200",
  approved:  "bg-teal-100 text-teal-800 border-teal-200",
  rejected:  "bg-orange-100 text-orange-800 border-orange-200",
  confirmed: "bg-purple-100 text-purple-800 border-purple-200",
  refunded:  "bg-yellow-100 text-yellow-800 border-yellow-200",
  activated: "bg-emerald-100 text-emerald-800 border-emerald-200",
  terminated:"bg-rose-100 text-rose-800 border-rose-200",
  expired:   "bg-gray-100 text-gray-600 border-gray-200",
};

function actionBadgeClass(action: string) {
  const verb = action.split(".").pop() ?? action;
  return ACTION_COLORS[verb] ?? "bg-muted text-muted-foreground";
}

export default function AuditLogPage() {
  const router = useRouter();
  const { roles } = usePermissions();
  const { data: sub } = useCurrentSubscription();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<ActiveFilters>({});
  const [selected, setSelected] = useState<AuditLogEntry | null>(null);

  const hasAccess = sub?.plan?.features?.audit_logs === true;
  const canView = roles.some((r) => ["owner", "manager", "superadmin"].includes(r));

  const params = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      search: search || undefined,
      resourceType: (filters.resourceType as string) || undefined,
      action: (filters.action as string) || undefined,
    }),
    [page, search, filters],
  );

  const { data, isLoading } = useAuditLogs(
    hasAccess && canView ? params : undefined,
  );

  const COLUMNS: Column<AuditLogEntry>[] = [
    {
      key: "createdAt",
      header: "Time",
      sortable: true,
      render: (e) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {formatDate(e.createdAt)}
        </span>
      ),
    },
    {
      key: "actorName",
      header: "Actor",
      render: (e) => (
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{e.actorName ?? "Unknown"}</p>
          {e.actorRole && (
            <p className="text-xs text-muted-foreground capitalize">{e.actorRole}</p>
          )}
        </div>
      ),
    },
    {
      key: "action",
      header: "Action",
      render: (e) => (
        <Badge variant="outline" className={actionBadgeClass(e.action)}>
          {e.action.split(".").pop()}
        </Badge>
      ),
    },
    {
      key: "resourceType",
      header: "Resource",
      render: (e) => (
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground capitalize mb-0.5">
            {e.resourceType}
          </p>
          <p className="text-sm truncate">{e.resourceLabel ?? "—"}</p>
        </div>
      ),
    },
    {
      key: "ipAddress",
      header: "IP",
      render: (e) => (
        <span
          className="font-mono text-xs text-muted-foreground"
          title={e.ipAddress ?? undefined}
        >
          {e.ipAddress ?? "—"}
        </span>
      ),
    },
  ];

  if (!canView) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">You do not have permission to view this page.</p>
      </div>
    );
  }

  if (sub && !hasAccess) {
    return (
      <div className="p-6 space-y-6">
        <PageHeader
          title="Audit Log"
          description="Track every action taken in your organisation."
          icon={<ScrollText className="h-5 w-5" />}
        />
        <Card className="p-8 flex flex-col items-center gap-4 text-center max-w-md mx-auto">
          <Lock className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="font-semibold">Upgrade to Agency or Enterprise</p>
            <p className="text-sm text-muted-foreground mt-1">
              Audit logs are available on Agency and Enterprise plans.
            </p>
          </div>
          <Button onClick={() => router.push("/subscription/plans")}>
            View Plans
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        title="Audit Log"
        description="A complete, tamper-evident record of actions in your organisation."
        icon={<ScrollText className="h-5 w-5" />}
      />

      <div className="flex items-center gap-2">
        <FilterBar
          value={search}
          onChange={(v) => { setSearch(v); setPage(1); }}
          placeholder="Search by resource name…"
          className="flex-1 max-w-sm"
        />
        <FilterPanel
          fields={FILTER_FIELDS}
          value={filters}
          onChange={(f) => { setFilters(f); setPage(1); }}
        />
      </div>

      <DataTable
        data={data?.data ?? []}
        columns={COLUMNS}
        loading={isLoading}
        totalItems={data?.total ?? 0}
        currentPage={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        onRowClick={(row) => setSelected(row)}
        rowKey={(row) => row.id}
      />

      <AuditLogDrawer
        entry={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
