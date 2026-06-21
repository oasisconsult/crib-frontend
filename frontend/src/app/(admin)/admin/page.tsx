"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  Users,
  Building2,
  Database,
  AlertTriangle,
  Activity,
  Trash2,
  UserCheck,
  UserX,
  CheckCircle2,
  XCircle,
  Clock,
  Server,
  MoreHorizontal,
  Search,
  Plus,
  MailCheck,
  Loader2,
  ScrollText,
  Zap,
  Home,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { PermissionGate } from "@/components/common/PermissionGate";
import { SettingsPanel } from "@/components/admin/SettingsPanel";
import { RbacPanel } from "@/components/admin/RbacPanel";
import { LeaseBillingTab } from "@/components/admin/LeaseBillingTab";
import { AuditLogDrawer } from "@/components/audit/AuditLogDrawer";
import { DataTable, type Column } from "@/components/common/DataTable";
import { useAdminAuditLogs } from "@/hooks/useAuditLogs";
import { FilterBar } from "@/components/common/FilterBar";
import { formatDate } from "@/utils/formatters";
import type { AuditLogEntry } from "@/services/api/auditLogs";
import type { AgencyListItem, LandlordListItem } from "@/services/api/adminOrgs";
import { useQuery } from "@tanstack/react-query";
import { useAgencyInvites, useCreateAgencyInvite, useRevokeAgencyInvite } from "@/hooks/useAgencyInvites";
import { useMigrateToPersonalOrg, useAssignToAgency, useRepairLandlordOrg, useRemoveFromLogtoOrg } from "@/hooks/useAdminLandlords";
import { useAdminAgencies, useAdminLandlords } from "@/hooks/useAdminOrgs";
import { AdminSearchCombobox, type ComboboxOption } from "@/components/admin/AdminSearchCombobox";
import { landlordsApi } from "@/services/api/landlords";
import { adminApi } from "@/services/api/admin";
import { toast } from "@/store/useUIStore";
import { cn } from "@/utils/cn";


const STATUS_CONFIG: Record<string, { label: string; variant: "success" | "destructive" | "outline" | "warning" }> = {
  active:   { label: "Active",   variant: "success"     },
  inactive: { label: "Inactive", variant: "outline"     },
  pending:  { label: "Pending",  variant: "warning"     },
};

const SERVICE_CONFIG: Record<string, { icon: React.ElementType; color: string }> = {
  healthy:  { icon: CheckCircle2, color: "text-emerald-600" },
  degraded: { icon: Clock,        color: "text-amber-500"   },
  down:     { icon: XCircle,      color: "text-red-600"     },
};

/* ── Admin Audit Logs Panel ──────────────────────────────────────────────── */

const AUDIT_ACTION_COLORS: Record<string, string> = {
  created:   "bg-green-100 text-green-800 border-green-200",
  deleted:   "bg-red-100 text-red-800 border-red-200",
  updated:   "bg-blue-100 text-blue-800 border-blue-200",
  approved:  "bg-teal-100 text-teal-800 border-teal-200",
  rejected:  "bg-orange-100 text-orange-800 border-orange-200",
  confirmed: "bg-purple-100 text-purple-800 border-purple-200",
  refunded:  "bg-yellow-100 text-yellow-800 border-yellow-200",
  activated: "bg-emerald-100 text-emerald-800 border-emerald-200",
  terminated:"bg-rose-100 text-rose-800 border-rose-200",
};

function auditBadgeClass(action: string) {
  const verb = action.split(".").pop() ?? action;
  return AUDIT_ACTION_COLORS[verb] ?? "bg-muted text-muted-foreground";
}

const ADMIN_AUDIT_COLUMNS: Column<AuditLogEntry>[] = [
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
    key: "organisationId",
    header: "Organisation",
    render: (e) => (
      <span className="font-mono text-xs">
        {e.organisationId ? e.organisationId.slice(0, 8) + "…" : "—"}
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
      <Badge variant="outline" className={auditBadgeClass(e.action)}>
        {e.action.split(".").pop()}
      </Badge>
    ),
  },
  {
    key: "resourceType",
    header: "Resource",
    render: (e) => (
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground capitalize mb-0.5">{e.resourceType}</p>
        <p className="text-sm truncate">{e.resourceLabel ?? "—"}</p>
      </div>
    ),
  },
];

const ADMIN_AUDIT_PAGE_SIZE = 50;
const ADMIN_LIST_PAGE_SIZE = 20;

const AGENCY_COLUMNS: Column<AgencyListItem>[] = [
  {
    key: "name",
    header: "Agency",
    render: (ag) => (
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-8 w-8 rounded-[6px] bg-violet-100 dark:bg-violet-950/30 flex items-center justify-center text-xs font-bold text-violet-700 dark:text-violet-300 shrink-0">
          {ag.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate">{ag.name}</p>
            {ag.isArchived && (
              <Badge variant="outline" className="text-xs text-muted-foreground shrink-0">Archived</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {ag.slug}{ag.country ? ` · ${ag.country}` : ""}
          </p>
        </div>
      </div>
    ),
  },
  {
    key: "totalProperties",
    header: "Properties",
    render: (ag) => (
      <div className="flex items-center gap-1.5">
        <Home className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm font-medium">{ag.totalProperties}</span>
        <span className="text-xs text-muted-foreground">({ag.activeProperties} active)</span>
      </div>
    ),
  },
  {
    key: "managerCount",
    header: "Managers",
    render: (ag) => (
      <div className="flex items-center gap-1.5">
        <Users className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm">{ag.managerCount}</span>
      </div>
    ),
  },
  {
    key: "landlordCount",
    header: "Landlords",
    render: (ag) => (
      <div className="flex items-center gap-1.5">
        <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm">{ag.landlordCount}</span>
      </div>
    ),
  },
  {
    key: "plan",
    header: "Plan",
    render: (ag) => (
      <Badge variant="outline" className="text-xs capitalize">{ag.plan}</Badge>
    ),
  },
];

const LANDLORD_COLUMNS: Column<LandlordListItem>[] = [
  {
    key: "displayName",
    header: "Landlord",
    render: (ll) => (
      <div className="flex items-center gap-3 min-w-0">
        <div className={cn(
          "h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
          ll.type === "independent"
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
            : "bg-sky-100 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300"
        )}>
          {(ll.displayName ?? ll.email ?? "?").split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{ll.displayName ?? "—"}</p>
          <p className="text-xs text-muted-foreground truncate">{ll.email ?? "—"}</p>
        </div>
      </div>
    ),
  },
  {
    key: "orgName",
    header: "Organisation",
    render: (ll) => (
      <p className="text-xs text-muted-foreground truncate max-w-[160px]">{ll.orgName ?? "—"}</p>
    ),
  },
  {
    key: "propertyCount",
    header: "Properties",
    render: (ll) => (
      <div className="flex items-center gap-1.5">
        <Home className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm font-medium">{ll.propertyCount}</span>
        {ll.activePropertyCount > 0 && (
          <span className="text-xs text-muted-foreground">({ll.activePropertyCount} active)</span>
        )}
      </div>
    ),
  },
  {
    key: "type",
    header: "Type",
    render: (ll) => (
      <Badge
        variant="outline"
        className={cn(
          "text-xs",
          ll.type === "independent"
            ? "text-emerald-700 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 dark:text-emerald-300"
            : "text-sky-700 border-sky-300 bg-sky-50 dark:bg-sky-950/20 dark:text-sky-300"
        )}
      >
        {ll.type === "independent" ? "Independent" : "Agency"}
      </Badge>
    ),
  },
];

function AdminAuditLogsPanel() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AuditLogEntry | null>(null);

  const { data, isLoading } = useAdminAuditLogs({
    page,
    pageSize: ADMIN_AUDIT_PAGE_SIZE,
    search: search || undefined,
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ScrollText className="h-4 w-4" />
          Platform Audit Logs
        </CardTitle>
        <CardDescription>Cross-organisation action history — all tenants</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FilterBar
          value={search}
          onChange={(v) => { setSearch(v); setPage(1); }}
          placeholder="Search by resource name…"
          className="max-w-sm"
        />
        <DataTable
          data={data?.data ?? []}
          columns={ADMIN_AUDIT_COLUMNS}
          loading={isLoading}
          totalItems={data?.total ?? 0}
          currentPage={page}
          pageSize={ADMIN_AUDIT_PAGE_SIZE}
          onPageChange={setPage}
          onRowClick={(row) => setSelected(row)}
          rowKey={(row) => row.id}
        />
        <AuditLogDrawer
          entry={selected}
          open={!!selected}
          onClose={() => setSelected(null)}
        />
      </CardContent>
    </Card>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
      {name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
    </div>
  );
}

const EMPTY_INVITE_FORM = {
  agencyName: "",
  managerEmail: "",
  managerFirstName: "",
  managerLastName: "",
  agencyPhone: "",
  agencyContactEmail: "",
  agencyCountry: "",
  agencyCurrency: "UGX",
  agencyAddress: "",
};

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState("users");
  const [search, setSearch] = useState("");
  const [agencySearch, setAgencySearch] = useState("");
  const [landlordSearch, setLandlordSearch] = useState("");
  const [agencyPage, setAgencyPage] = useState(1);
  const [landlordPage, setLandlordPage] = useState(1);

  const { data: agenciesData, isLoading: loadingAgencies } = useAdminAgencies({
    page: agencyPage,
    pageSize: 20,
    search: agencySearch || undefined,
  });
  const { data: landlordsData, isLoading: loadingLandlords } = useAdminLandlords({
    page: landlordPage,
    pageSize: 20,
    search: landlordSearch || undefined,
  });

  // ── Real data fetching ──────────────────────────────────────────────────
  const { data: profilesPage, isLoading: loadingProfiles } = useQuery({
    queryKey: ["admin", "profiles", search],
    queryFn: () => adminApi.listProfiles({ pageSize: 100 }),
    staleTime: 30_000,
  });

  const { data: platformStats } = useQuery({
    queryKey: ["admin", "platform-stats"],
    queryFn: adminApi.platformStats,
    staleTime: 60_000,
  });

  const { data: healthData } = useQuery({
    queryKey: ["admin", "health"],
    queryFn: adminApi.healthReady,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const allProfiles = profilesPage?.data ?? [];
  const filteredProfiles = allProfiles.filter(
    (u) =>
      !search ||
      (u.displayName ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (u.email ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  const statsCards = [
    {
      label: "Total Users",
      value: platformStats?.totalProfiles?.toString() ?? "—",
      icon: Users,
      color: "text-blue-600",
      bg: "bg-blue-100 dark:bg-blue-950/30",
    },
    {
      label: "Organisations",
      value: platformStats?.activeOrganisations?.toString() ?? "—",
      icon: Building2,
      color: "text-violet-600",
      bg: "bg-violet-100 dark:bg-violet-950/30",
    },
    {
      label: "DB",
      value: healthData?.checks?.database === "ok" ? "Healthy" : "Error",
      icon: Database,
      color: healthData?.checks?.database === "ok" ? "text-emerald-600" : "text-red-600",
      bg: healthData?.checks?.database === "ok"
        ? "bg-emerald-100 dark:bg-emerald-950/30"
        : "bg-red-100 dark:bg-red-950/30",
    },
    {
      label: "Redis",
      value: healthData?.checks?.redis === "ok" ? "Healthy" : "Error",
      icon: Activity,
      color: healthData?.checks?.redis === "ok" ? "text-green-600" : "text-red-600",
      bg: healthData?.checks?.redis === "ok"
        ? "bg-green-100 dark:bg-green-950/30"
        : "bg-red-100 dark:bg-red-950/30",
    },
  ];

  const systemServices = Object.entries(healthData?.checks ?? {}).map(([svc, status]) => ({
    service: svc === "database" ? "PostgreSQL" : svc === "redis" ? "Redis Cache" : svc,
    status: status === "ok" ? "healthy" : "down",
    detail: status === "ok" ? "ok" : status,
  }));

  // ── Landlord admin actions ──────────────────────────────────────────────
  const [migrateLandlord, setMigrateLandlord] = useState<ComboboxOption | null>(null);
  const [assignLandlord, setAssignLandlord] = useState<ComboboxOption | null>(null);
  const [assignAgency, setAssignAgency] = useState<ComboboxOption | null>(null);
  const [repairLandlord, setRepairLandlord] = useState<ComboboxOption | null>(null);
  const [repairTargetOrg, setRepairTargetOrg] = useState<ComboboxOption | null>(null);
  const [removeFromOrgLandlord, setRemoveFromOrgLandlord] = useState<ComboboxOption | null>(null);
  const [logtoOrgIdToRemove, setLogtoOrgIdToRemove] = useState("");
  const { mutate: migrateToPersonalOrg, isPending: migrating } = useMigrateToPersonalOrg();
  const { mutate: assignToAgency, isPending: assigning } = useAssignToAgency();
  const { mutate: repairOrg, isPending: repairing } = useRepairLandlordOrg();
  const { mutate: removeFromLogtoOrg, isPending: removing } = useRemoveFromLogtoOrg();

  async function searchAllProfiles(q: string): Promise<ComboboxOption[]> {
    const results = await landlordsApi.searchProfiles(q);
    return results.map((r) => ({
      id: r.id,
      label: r.displayName ?? r.email ?? r.id,
      sublabel: r.email ?? undefined,
      badge: r.role,
      badgeClassName: "bg-muted text-muted-foreground border-border",
    }));
  }

  async function searchLandlords(q: string): Promise<ComboboxOption[]> {
    const results = await landlordsApi.searchProfiles(q, "landlord");
    return results.map((r) => ({
      id: r.id,
      label: r.displayName ?? r.email ?? r.id,
      sublabel: r.email ?? undefined,
      badge: r.role,
      badgeClassName: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-800",
    }));
  }

  function handleRemoveFromLogtoOrg() {
    if (!removeFromOrgLandlord || !logtoOrgIdToRemove.trim()) {
      toast.error("Missing fields", "Select a landlord and enter the Logto org ID");
      return;
    }
    removeFromLogtoOrg(
      { profileId: removeFromOrgLandlord.id, logtoOrgId: logtoOrgIdToRemove.trim() },
      {
        onSuccess: (res) => {
          toast.success(
            res.removed ? "Removed from Logto org" : "Warning: removal may have failed",
            res.message,
          );
          setRemoveFromOrgLandlord(null);
          setLogtoOrgIdToRemove("");
        },
        onError: (err: any) =>
          toast.error("Failed", err?.response?.data?.detail ?? "Please try again"),
      },
    );
  }

  function handleRepairOrg() {
    if (!repairLandlord || !repairTargetOrg) {
      toast.error("Missing fields", "Select both the landlord and their personal org");
      return;
    }
    repairOrg(
      { profileId: repairLandlord.id, targetOrgId: repairTargetOrg.id },
      {
        onSuccess: (res) => {
          toast.success("DB profile repaired", res.message);
          setRepairLandlord(null);
          setRepairTargetOrg(null);
        },
        onError: (err: any) =>
          toast.error("Repair failed", err?.response?.data?.detail ?? "Please try again"),
      },
    );
  }

  async function searchAgencies(q: string): Promise<ComboboxOption[]> {
    const results = await landlordsApi.searchOrganisations(q, true);
    return results.map((r) => ({
      id: r.id,
      label: r.name,
      sublabel: r.slug,
    }));
  }

  function handleMigrateToPersonalOrg() {
    if (!migrateLandlord) {
      toast.error("Missing field", "Search for and select a landlord first");
      return;
    }
    migrateToPersonalOrg(migrateLandlord.id, {
      onSuccess: (res) => {
        if (res.warning) {
          toast.error("Migrated with warnings", res.warning);
        } else {
          toast.success("Migrated successfully", `${res.org_name} created. Logto org removed ✓. Role stripped ✓. Ask the user to log out and back in.`);
        }
        setMigrateLandlord(null);
      },
      onError: (err: any) =>
        toast.error("Migration failed", err?.response?.data?.detail ?? "Please try again"),
    });
  }

  function handleAssignToAgency() {
    if (!assignLandlord || !assignAgency) {
      toast.error("Missing fields", "Select both a landlord and an agency");
      return;
    }
    assignToAgency(
      { profileId: assignLandlord.id, body: { agency_org_id: assignAgency.id } },
      {
        onSuccess: (res) => {
          toast.success("Assigned", res.message);
          setAssignLandlord(null);
          setAssignAgency(null);
        },
        onError: (err: any) =>
          toast.error("Assignment failed", err?.response?.data?.detail ?? "Please try again"),
      },
    );
  }

  // ── Org feature flags ──────────────────────────────────────────────────
  const [featOrg, setFeatOrg] = useState<ComboboxOption | null>(null);
  const [featValues, setFeatValues] = useState<Record<string, boolean>>({});
  const [loadingFeats, setLoadingFeats] = useState(false);
  const [savingFeat, setSavingFeat] = useState<string | null>(null);

  async function loadOrgFeatures(org: ComboboxOption) {
    setFeatOrg(org);
    setFeatValues({});
    setLoadingFeats(true);
    try {
      const result = await adminApi.getOrgFeatures(org.id);
      setFeatValues(result.features);
    } catch {
      toast.error("Failed to load feature flags for this organisation");
    } finally {
      setLoadingFeats(false);
    }
  }

  async function toggleOrgFeature(key: string, value: boolean) {
    if (!featOrg) return;
    setSavingFeat(key);
    try {
      const result = await adminApi.updateOrgFeatures(featOrg.id, { [key]: value });
      setFeatValues(result.features);
      toast.success(`${value ? "Enabled" : "Disabled"} for ${featOrg.label}`);
    } catch {
      toast.error("Failed to update feature flag");
    } finally {
      setSavingFeat(null);
    }
  }

  // ── Agency invites ──────────────────────────────────────────────────────
  const { data: agencyInvites = [], isLoading: loadingInvites } = useAgencyInvites();
  const { mutate: createInvite, isPending: creatingInvite } = useCreateAgencyInvite();
  const { mutate: revokeInvite } = useRevokeAgencyInvite();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState(EMPTY_INVITE_FORM);

  function handleCreateAgencyInvite() {
    if (!inviteForm.agencyName || !inviteForm.managerEmail || !inviteForm.managerFirstName || !inviteForm.managerLastName) {
      toast.error("Missing fields", "Agency name, manager name, and email are required");
      return;
    }
    createInvite(
      {
        agencyName: inviteForm.agencyName,
        managerEmail: inviteForm.managerEmail,
        managerFirstName: inviteForm.managerFirstName,
        managerLastName: inviteForm.managerLastName,
        agencyPhone: inviteForm.agencyPhone || undefined,
        agencyContactEmail: inviteForm.agencyContactEmail || undefined,
        agencyCountry: inviteForm.agencyCountry || undefined,
        agencyCurrency: inviteForm.agencyCurrency || undefined,
        agencyAddress: inviteForm.agencyAddress || undefined,
      },
      {
        onSuccess: () => {
          toast.success("Invite sent", `${inviteForm.managerEmail} will receive an onboarding link`);
          setShowInviteModal(false);
          setInviteForm(EMPTY_INVITE_FORM);
        },
        onError: (err: any) =>
          toast.error("Failed to send invite", err?.response?.data?.detail ?? "Please try again"),
      },
    );
  }

  return (
    <PermissionGate
      role="superadmin"
      fallback={
        <div className="flex items-center justify-center h-full py-24">
          <div className="text-center space-y-3">
            <Shield className="h-12 w-12 text-muted-foreground mx-auto" />
            <h2 className="text-lg font-semibold">Access Denied</h2>
            <p className="text-sm text-muted-foreground">
              This area is restricted to super admins only.
            </p>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* ── Page header ──────────────────────────────────────── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[6px] bg-red-100 text-red-600 dark:bg-red-950/30">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Super Admin</h1>
              <p className="text-sm text-muted-foreground">Platform administration · Kampala, UG</p>
            </div>
          </div>
          <Badge variant="destructive" className="w-fit">Admin Only</Badge>
        </div>

        {/* ── Summary stats ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {statsCards.map((s) => (
            <Card key={s.label}>
              <CardContent className="pt-4 pb-3">
                <div className={cn("h-8 w-8 rounded-[6px] flex items-center justify-center mb-2", s.bg)}>
                  <s.icon className={cn("h-4 w-4", s.color)} />
                </div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className={cn("text-2xl font-bold mt-0.5", s.color)}>{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── Tabs ──────────────────────────────────────────────── */}
        <Tabs value={tab} onValueChange={setTab}>
          <div className="overflow-x-auto pb-px">
            <TabsList className="flex w-max min-w-full h-auto gap-0.5 p-1">
              {/* ── People ── */}
              <TabsTrigger value="users" className="shrink-0">
                <Users className="h-3.5 w-3.5 mr-1.5" />
                Users
              </TabsTrigger>
              <TabsTrigger value="agencies" className="shrink-0">
                <Building2 className="h-3.5 w-3.5 mr-1.5" />
                Agencies
              </TabsTrigger>
              <TabsTrigger value="landlords" className="shrink-0">
                <UserCheck className="h-3.5 w-3.5 mr-1.5" />
                Landlords
              </TabsTrigger>
              {/* ── Finance ── */}
              <TabsTrigger value="lease-billing" className="shrink-0">
                <ScrollText className="h-3.5 w-3.5 mr-1.5" />
                Billing Ops
              </TabsTrigger>
              {/* ── Platform ── */}
              <TabsTrigger value="system" className="shrink-0">
                <Server className="h-3.5 w-3.5 mr-1.5" />
                System Health
              </TabsTrigger>
              <TabsTrigger value="access" className="shrink-0">
                <Shield className="h-3.5 w-3.5 mr-1.5" />
                Access Control
              </TabsTrigger>
              <TabsTrigger value="gdpr" className="shrink-0">
                <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
                Compliance
              </TabsTrigger>
              <TabsTrigger value="audit-logs" className="shrink-0">
                <ScrollText className="h-3.5 w-3.5 mr-1.5" />
                Audit Logs
              </TabsTrigger>
            </TabsList>
            {/* Settings now has its own sub-pages via sidebar nav — no tab needed */}
          </div>

          {/* ─── Users tab ───────────────────────────────────── */}
          <TabsContent value="users" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-base">Platform Users</CardTitle>
                    <CardDescription>Manage landlords and tenants across Kampala</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                      <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search users..."
                        className="h-8 w-48 rounded-[5px] border border-input bg-background pl-8 pr-3 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    </div>
                    <Button size="sm" variant="outline">
                      <Plus className="h-3.5 w-3.5" />
                      Invite
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {loadingProfiles ? (
                  <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading users…
                  </div>
                ) : (
                  <>
                    {/* Table header */}
                    <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto] gap-4 px-3 py-2 text-xs font-medium text-muted-foreground border-b">
                      <span>User</span>
                      <span>Role</span>
                      <span>Joined</span>
                      <span>Status</span>
                    </div>

                    <div className="divide-y">
                      {filteredProfiles.map((u) => (
                        <div
                          key={u.id}
                          className="grid sm:grid-cols-[1fr_auto_auto_auto] gap-3 sm:gap-4 items-center py-3 px-3 hover:bg-primary/5 rounded-[6px] transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <Avatar name={u.displayName ?? u.email ?? "?"} />
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{u.displayName ?? "—"}</p>
                              <p className="text-xs text-muted-foreground truncate">{u.email ?? "—"}</p>
                            </div>
                          </div>
                          <Badge variant="outline" className="text-xs capitalize w-fit">
                            {u.role}
                          </Badge>
                          <span className="text-xs text-muted-foreground hidden sm:block whitespace-nowrap">
                            {new Date(u.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" })}
                          </span>
                          <div className="flex items-center gap-2 justify-end">
                            <Badge variant={u.isActive ? "success" : "outline"} className="text-xs hidden sm:inline-flex">
                              {u.isActive ? "Active" : "Inactive"}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {filteredProfiles.length === 0 && (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        {search ? "No users match your search" : "No users found"}
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Breakdown by status */}
            <div className="grid sm:grid-cols-3 gap-3">
              {[
                { label: "Active",   count: platformStats?.activeProfiles ?? 0,   icon: UserCheck, color: "text-emerald-600" },
                { label: "Total Orgs", count: platformStats?.activeOrganisations ?? 0, icon: Building2, color: "text-blue-600" },
                { label: "Total Profiles", count: platformStats?.totalProfiles ?? 0, icon: Users, color: "text-violet-600" },
              ].map((s) => (
                <Card key={s.label}>
                  <CardContent className="flex items-center gap-3 pt-4 pb-3">
                    <s.icon className={cn("h-5 w-5", s.color)} />
                    <div>
                      <p className="text-xs text-muted-foreground">{s.label}</p>
                      <p className="text-xl font-bold">{s.count}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* ─── Agencies tab ────────────────────────────────── */}
          <TabsContent value="agencies" className="mt-4 space-y-4">
            {/* ── All agencies list ── */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-violet-600" />
                      All Agencies
                      {agenciesData && (
                        <span className="text-xs text-muted-foreground font-normal">
                          {agenciesData.total} total
                        </span>
                      )}
                    </CardTitle>
                    <CardDescription>
                      Click any row to view full agency breakdown
                    </CardDescription>
                  </div>
                  <FilterBar
                    value={agencySearch}
                    onChange={(v) => { setAgencySearch(v); setAgencyPage(1); }}
                    placeholder="Search agencies…"
                    className="max-w-48"
                  />
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <DataTable
                  data={agenciesData?.data ?? []}
                  columns={AGENCY_COLUMNS}
                  loading={loadingAgencies}
                  rowKey={(ag) => ag.id}
                  onRowClick={(ag) => router.push(`/admin/agencies/${ag.id}`)}
                  totalItems={agenciesData?.total ?? 0}
                  currentPage={agencyPage}
                  pageSize={ADMIN_LIST_PAGE_SIZE}
                  onPageChange={setAgencyPage}
                  emptyTitle="No agencies yet"
                  emptyDescription={agencySearch ? "Try a different search term" : "Invite an agency using the form below"}
                />
              </CardContent>
            </Card>

            {/* ── Invite management (existing) ── */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-base">Agency Invites</CardTitle>
                    <CardDescription>
                      Invite a new property agency to onboard onto Crib. An email with a
                      setup link will be sent to the agency manager.
                    </CardDescription>
                  </div>
                  <Button size="sm" onClick={() => setShowInviteModal(true)}>
                    <Plus className="h-3.5 w-3.5" />
                    Invite agency
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {loadingInvites ? (
                  <div className="flex items-center gap-2 py-6 text-muted-foreground text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading…
                  </div>
                ) : agencyInvites.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <Building2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No agency invites yet</p>
                    <p className="text-xs mt-1">Use the button above to invite a new agency</p>
                  </div>
                ) : (
                  <>
                    <div className="hidden sm:grid grid-cols-[1fr_1fr_auto_auto_auto] gap-4 px-3 py-2 text-xs font-medium text-muted-foreground border-b">
                      <span>Agency</span>
                      <span>Manager</span>
                      <span>Sent</span>
                      <span>Status</span>
                      <span />
                    </div>
                    <div className="divide-y">
                      {agencyInvites.map((inv) => (
                        <div
                          key={inv.id}
                          className="grid sm:grid-cols-[1fr_1fr_auto_auto_auto] gap-3 sm:gap-4 items-center py-3 px-3"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{inv.agencyName}</p>
                            {inv.agencyContactEmail && (
                              <p className="text-xs text-muted-foreground truncate">
                                {inv.agencyContactEmail}
                              </p>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm truncate">
                              {inv.managerFirstName} {inv.managerLastName}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {inv.managerEmail}
                            </p>
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap hidden sm:block">
                            {new Date(inv.createdAt).toLocaleDateString("en-GB", {
                              day: "numeric",
                              month: "short",
                            })}
                          </span>
                          <Badge
                            variant={
                              inv.status === "accepted"
                                ? "success"
                                : inv.status === "pending"
                                  ? "warning"
                                  : "outline"
                            }
                            className="text-xs capitalize w-fit"
                          >
                            {inv.status}
                          </Badge>
                          {inv.status === "pending" ? (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                              onClick={() =>
                                revokeInvite(inv.id, {
                                  onSuccess: () => toast.success("Invite revoked"),
                                  onError: () => toast.error("Failed to revoke invite"),
                                })
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <div className="w-7" />
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* ── Org Feature Flags ── */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="h-4 w-4 text-violet-500" />
                  Organisation Feature Flags
                </CardTitle>
                <CardDescription>
                  Override which features are active for a specific organisation. Overrides layer on
                  top of the organisation&apos;s subscription plan features.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Organisation</Label>
                  <AdminSearchCombobox
                    placeholder="Search by org name…"
                    onSearch={(q) => searchAgencies(q)}
                    onSelect={loadOrgFeatures}
                    selected={featOrg}
                    disabled={loadingFeats || !!savingFeat}
                  />
                </div>

                {featOrg && (
                  <div className="rounded-[6px] border divide-y">
                    {loadingFeats ? (
                      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading feature flags…
                      </div>
                    ) : (
                      [
                        {
                          key: "manualPayments",
                          label: "Record Manual Payment",
                          description: "Managers can record cash / bank / mobile money payments made outside Crib.",
                        },
                      ].map(({ key, label, description }) => {
                        const enabled = featValues[key] === true;
                        const isSaving = savingFeat === key;
                        return (
                          <div key={key} className="flex items-start justify-between gap-4 p-3">
                            <div className="space-y-0.5">
                              <p className="text-sm font-medium">{label}</p>
                              <p className="text-xs text-muted-foreground">{description}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 pt-0.5">
                              {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                              <Switch
                                checked={enabled}
                                disabled={!!savingFeat}
                                onCheckedChange={(v) => toggleOrgFeature(key, v)}
                              />
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {!featOrg && (
                  <p className="text-xs text-muted-foreground">
                    Search for an organisation above to view and edit its feature flags.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* ── Invite modal ── */}
            {showInviteModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
                <Card className="w-full max-w-lg my-4">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MailCheck className="h-5 w-5" />
                      Invite New Agency
                    </CardTitle>
                    <CardDescription>
                      The agency manager will receive an onboarding link to set up their
                      account and agency profile.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                        Agency Details
                      </p>
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="ia-agencyName">Agency name *</Label>
                          <Input
                            id="ia-agencyName"
                            value={inviteForm.agencyName}
                            onChange={(e) =>
                              setInviteForm((f) => ({ ...f, agencyName: e.target.value }))
                            }
                            placeholder="e.g. GeoBox Properties Ltd"
                          />
                          <p className="text-xs text-muted-foreground">
                            This becomes the locked agency name after onboarding
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label htmlFor="ia-agencyPhone">Phone</Label>
                            <Input
                              id="ia-agencyPhone"
                              type="tel"
                              value={inviteForm.agencyPhone}
                              onChange={(e) =>
                                setInviteForm((f) => ({ ...f, agencyPhone: e.target.value }))
                              }
                              placeholder="+256 700 000000"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="ia-agencyEmail">Contact email</Label>
                            <Input
                              id="ia-agencyEmail"
                              type="email"
                              value={inviteForm.agencyContactEmail}
                              onChange={(e) =>
                                setInviteForm((f) => ({
                                  ...f,
                                  agencyContactEmail: e.target.value,
                                }))
                              }
                              placeholder="info@agency.com"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label htmlFor="ia-country">Country</Label>
                            <Input
                              id="ia-country"
                              value={inviteForm.agencyCountry}
                              onChange={(e) =>
                                setInviteForm((f) => ({ ...f, agencyCountry: e.target.value }))
                              }
                              placeholder="Uganda"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="ia-currency">Currency</Label>
                            <Input
                              id="ia-currency"
                              value={inviteForm.agencyCurrency}
                              onChange={(e) =>
                                setInviteForm((f) => ({
                                  ...f,
                                  agencyCurrency: e.target.value,
                                }))
                              }
                              placeholder="UGX"
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="ia-address">Address</Label>
                          <Input
                            id="ia-address"
                            value={inviteForm.agencyAddress}
                            onChange={(e) =>
                              setInviteForm((f) => ({ ...f, agencyAddress: e.target.value }))
                            }
                            placeholder="Plot 12, Kampala Road"
                          />
                        </div>
                      </div>
                    </div>

                    <Separator />

                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                        Initial Manager
                      </p>
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label htmlFor="ia-mgrFirst">First name *</Label>
                            <Input
                              id="ia-mgrFirst"
                              value={inviteForm.managerFirstName}
                              onChange={(e) =>
                                setInviteForm((f) => ({
                                  ...f,
                                  managerFirstName: e.target.value,
                                }))
                              }
                              placeholder="Tom"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="ia-mgrLast">Last name *</Label>
                            <Input
                              id="ia-mgrLast"
                              value={inviteForm.managerLastName}
                              onChange={(e) =>
                                setInviteForm((f) => ({
                                  ...f,
                                  managerLastName: e.target.value,
                                }))
                              }
                              placeholder="Mukasa"
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="ia-mgrEmail">Manager email *</Label>
                          <Input
                            id="ia-mgrEmail"
                            type="email"
                            value={inviteForm.managerEmail}
                            onChange={(e) =>
                              setInviteForm((f) => ({ ...f, managerEmail: e.target.value }))
                            }
                            placeholder="manager@agency.com"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowInviteModal(false);
                          setInviteForm(EMPTY_INVITE_FORM);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button onClick={handleCreateAgencyInvite} loading={creatingInvite}>
                        Send invite
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* ─── Landlords tab ───────────────────────────────── */}
          <TabsContent value="landlords" className="mt-4 space-y-4">
            {/* ── All landlords list ── */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <UserCheck className="h-4 w-4 text-sky-600" />
                      All Landlords & Owners
                      {landlordsData && (
                        <span className="text-xs text-muted-foreground font-normal">
                          {landlordsData.total} total
                        </span>
                      )}
                    </CardTitle>
                    <CardDescription>
                      Click any row to view portfolio details
                    </CardDescription>
                  </div>
                  <FilterBar
                    value={landlordSearch}
                    onChange={(v) => { setLandlordSearch(v); setLandlordPage(1); }}
                    placeholder="Search landlords…"
                    className="max-w-48"
                  />
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <DataTable
                  data={landlordsData?.data ?? []}
                  columns={LANDLORD_COLUMNS}
                  loading={loadingLandlords}
                  rowKey={(ll) => ll.id}
                  onRowClick={(ll) => router.push(`/admin/landlords/${ll.id}`)}
                  totalItems={landlordsData?.total ?? 0}
                  currentPage={landlordPage}
                  pageSize={ADMIN_LIST_PAGE_SIZE}
                  onPageChange={setLandlordPage}
                  emptyTitle="No landlords yet"
                  emptyDescription={landlordSearch ? "Try a different search term" : "Invite landlords via the Agencies tab or the Landlords page"}
                />
              </CardContent>
            </Card>

            {/* ── Admin tools (existing) ── */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-emerald-600" />
                  Migrate Landlord to Personal Organisation
                </CardTitle>
                <CardDescription>
                  Use this when a landlord was incorrectly linked to an agency org at invite time.
                  Creates a new personal Logto org, moves the landlord out of the old org, and
                  makes them owner of their own org. Their properties stay with them.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-[6px] border border-sky-200 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/30 p-3 text-sm text-sky-800 dark:text-sky-200">
                  <strong>Example:</strong> Tito Mukuru was invited by GeoBox but should be
                  self-managing. Run this to give them their own isolated org so they stop seeing
                  GeoBox data.
                </div>
                <div className="space-y-1.5">
                  <Label>Landlord</Label>
                  <AdminSearchCombobox
                    placeholder="Search by name or email…"
                    onSearch={searchAllProfiles}
                    onSelect={setMigrateLandlord}
                    selected={migrateLandlord}
                    disabled={migrating}
                  />
                  <p className="text-xs text-muted-foreground">
                    Searches all profiles by name or email regardless of role.
                  </p>
                </div>
                <div className="flex justify-end">
                  <Button
                    onClick={handleMigrateToPersonalOrg}
                    loading={migrating}
                    disabled={!migrateLandlord}
                  >
                    Migrate to personal org
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-violet-600" />
                  Assign Landlord to Agency
                </CardTitle>
                <CardDescription>
                  Transfer a self-managing landlord into agency management. All their properties
                  move to the agency org, LandlordPropertyAccess grants are created so they can
                  still view their properties, and their personal org is archived.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-[6px] border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3 text-sm text-amber-800 dark:text-amber-200">
                  This action archives the landlord&apos;s personal org. Their properties transfer
                  to the agency. The landlord keeps read-only access via LandlordPropertyAccess.
                </div>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Landlord</Label>
                    <AdminSearchCombobox
                      placeholder="Search landlord by name or email…"
                      onSearch={searchLandlords}
                      onSelect={setAssignLandlord}
                      selected={assignLandlord}
                      disabled={assigning}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Target Agency</Label>
                    <AdminSearchCombobox
                      placeholder="Search agency by name…"
                      onSearch={searchAgencies}
                      onSelect={setAssignAgency}
                      selected={assignAgency}
                      disabled={assigning}
                    />
                    <p className="text-xs text-muted-foreground">
                      Only active (non-archived) agencies are shown.
                    </p>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      onClick={handleAssignToAgency}
                      loading={assigning}
                      disabled={!assignLandlord || !assignAgency}
                      variant="outline"
                    >
                      Assign to agency
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  Step 1 — Remove from old Logto org
                </CardTitle>
                <CardDescription>
                  Open the Logto admin console, find the old org (e.g. GeoBox), copy the
                  Organisation ID shown next to the org name, and paste it below. This directly
                  removes the user from that org and strips the &lsquo;landlord&rsquo; app role
                  from their account.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-[6px] border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 p-3 text-sm text-red-800 dark:text-red-300">
                  <strong>Tito fix:</strong> GeoBox&apos;s Logto org ID is <code className="font-mono bg-red-100 dark:bg-red-900 px-1 rounded">o90iciqf8717</code> (visible in your screenshot). Paste it below and select Tito.
                </div>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Landlord to remove</Label>
                    <AdminSearchCombobox
                      placeholder="Search by name or email…"
                      onSearch={searchAllProfiles}
                      onSelect={setRemoveFromOrgLandlord}
                      selected={removeFromOrgLandlord}
                      disabled={removing}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="logto-org-id">Logto Org ID (from Logto console)</Label>
                    <Input
                      id="logto-org-id"
                      value={logtoOrgIdToRemove}
                      onChange={(e) => setLogtoOrgIdToRemove(e.target.value)}
                      placeholder="e.g. o90iciqf8717"
                      className="font-mono text-sm"
                      disabled={removing}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button
                      onClick={handleRemoveFromLogtoOrg}
                      loading={removing}
                      disabled={!removeFromOrgLandlord || !logtoOrgIdToRemove.trim()}
                      variant="destructive"
                    >
                      Remove from Logto org
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Step 2 — Fix DB profile to personal org
                </CardTitle>
                <CardDescription>
                  After removing from the old Logto org, point the profile at the correct personal
                  org in the database so the next login syncs correctly.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Affected Landlord</Label>
                    <AdminSearchCombobox
                      placeholder="Search by name or email…"
                      onSearch={searchAllProfiles}
                      onSelect={setRepairLandlord}
                      selected={repairLandlord}
                      disabled={repairing}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Their Personal Org (target)</Label>
                    <AdminSearchCombobox
                      placeholder="Search org, e.g. Tito's Properties…"
                      onSearch={searchAgencies}
                      onSelect={setRepairTargetOrg}
                      selected={repairTargetOrg}
                      disabled={repairing}
                    />
                    <p className="text-xs text-muted-foreground">
                      Search for the personal org created during migration.
                    </p>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      onClick={handleRepairOrg}
                      loading={repairing}
                      disabled={!repairLandlord || !repairTargetOrg}
                      variant="outline"
                    >
                      Fix DB profile
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── System tab ──────────────────────────────────── */}
          <TabsContent value="system" className="mt-4 space-y-4">
            <div className="grid sm:grid-cols-3 gap-3">
              {[
                { label: "Total Profiles", value: platformStats?.totalProfiles ?? "—", icon: Users,    color: "text-sky-600"     },
                { label: "Organisations",  value: platformStats?.activeOrganisations ?? "—", icon: Building2, color: "text-violet-600"  },
                { label: "API Status",     value: healthData?.status === "ready" ? "Ready" : healthData?.status ?? "—", icon: Server,  color: healthData?.status === "ready" ? "text-emerald-600" : "text-amber-600" },
              ].map((s) => (
                <Card key={s.label}>
                  <CardContent className="flex items-center gap-3 pt-4 pb-3">
                    <s.icon className={cn("h-5 w-5", s.color)} />
                    <div>
                      <p className="text-xs text-muted-foreground">{s.label}</p>
                      <p className="text-xl font-bold">{s.value}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Service Status</CardTitle>
                <CardDescription>Real-time health of platform services</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                {systemServices.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">Loading health data…</p>
                ) : (
                  systemServices.map((s, i) => {
                    const cfg = SERVICE_CONFIG[s.status] ?? SERVICE_CONFIG.healthy;
                    const Icon = cfg.icon;
                    return (
                      <div key={s.service}>
                        {i > 0 && <Separator className="my-1" />}
                        <div className="flex items-center justify-between py-2 text-sm">
                          <div className="flex items-center gap-2.5">
                            <Icon className={cn("h-4 w-4", cfg.color)} />
                            <span className="font-medium">{s.service}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            {s.status !== "healthy" && (
                              <span className="text-xs text-muted-foreground truncate max-w-[180px]" title={s.detail}>
                                {s.detail}
                              </span>
                            )}
                            <Badge
                              variant={s.status === "healthy" ? "success" : s.status === "degraded" ? "warning" : "destructive"}
                              className="text-xs capitalize"
                            >
                              {s.status}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── Access Control tab ──────────────────────────── */}
          <TabsContent value="access" className="mt-4">
            <RbacPanel />
          </TabsContent>

          {/* ─── Compliance tab ──────────────────────────────── */}
          <TabsContent value="gdpr" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Data & Compliance Tools
                </CardTitle>
                <CardDescription>
                  Data subject requests and PDPA compliance (Uganda Data Protection Act)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="rounded-[6px] border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4 text-sm text-amber-800 dark:text-amber-200">
                  Actions in this section are <strong>irreversible</strong>. Proceed only after verifying the request is legitimate.
                </div>

                <div className="space-y-3">
                  <Label htmlFor="anonymise-tenant-id" className="text-sm font-medium">Anonymise Tenant Data</Label>
                  <p className="text-xs text-muted-foreground">
                    Permanently redacts a tenant&apos;s personal information. Complies with Art. 22 of the Uganda Data Protection and Privacy Act.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      id="anonymise-tenant-id"
                      type="text"
                      placeholder="Tenant ID (e.g. tenant-3)..."
                      className="flex-1"
                    />
                    <Button variant="destructive" size="sm">
                      Anonymise
                    </Button>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <Label htmlFor="export-user-id" className="text-sm font-medium">Export User Data</Label>
                  <p className="text-xs text-muted-foreground">
                    Generate a full data export for a user (right to portability).
                  </p>
                  <div className="flex gap-2">
                    <Input
                      id="export-user-id"
                      type="text"
                      placeholder="User ID or email..."
                      className="flex-1"
                    />
                    <Button variant="outline" size="sm">
                      Export
                    </Button>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <p className="text-sm font-medium">Audit Log</p>
                  <p className="text-xs text-muted-foreground">Recent admin actions</p>
                  {[
                    { action: "Exported data for tenant-3",      actor: "admin@crib.ug", time: "Today 09:14" },
                    { action: "Changed role: landlord → tenant", actor: "admin@crib.ug", time: "Yesterday"   },
                    { action: "Disabled account: user-5",        actor: "admin@crib.ug", time: "2 days ago"  },
                  ].map((entry, i) => (
                    <div key={i} className="flex items-start justify-between gap-4 py-2 text-xs border-t first:border-t-0">
                      <span className="text-foreground">{entry.action}</span>
                      <div className="text-right shrink-0 text-muted-foreground">
                        <p>{entry.actor}</p>
                        <p>{entry.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── Lease Billing tab ──────────────────────────────── */}
          <TabsContent value="lease-billing" className="mt-4">
            <LeaseBillingTab />
          </TabsContent>

          {/* ─── Audit Logs tab ─────────────────────────────────── */}
          <TabsContent value="audit-logs" className="mt-4">
            <AdminAuditLogsPanel />
          </TabsContent>
        </Tabs>
      </div>
    </PermissionGate>
  );
}
