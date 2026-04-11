"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { StatsGrid } from "@/components/dashboard/StatsGrid";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { PendingRentWidget } from "@/components/dashboard/PendingRentWidget";
import { ActivityTimeline } from "@/components/dashboard/ActivityTimeline";
import { TopProperties } from "@/components/dashboard/TopProperties";
import { useAppStore } from "@/store/useAppStore";
import { usePermissions } from "@/hooks/usePermissions";
import { useInspections, useMaintenanceIssues } from "@/hooks/useInspections";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardList, Wrench, AlertCircle } from "lucide-react";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ── Maintenance staff dashboard ───────────────────────────────────────────────

function MaintenanceDashboard({ firstName }: { firstName: string }) {
  const { data: inspectionsData } = useInspections({ filters: [{ field: "status", operator: "in", value: ["scheduled", "in_progress"] }] });
  const { data: maintenanceData } = useMaintenanceIssues();

  const inspections = inspectionsData?.data ?? [];
  const issues = maintenanceData?.data ?? [];
  const openIssues = issues.filter(
    (i: any) => i.status === "open" || i.status === "in_progress",
  );

  return (
    <div className="space-y-8" style={{ fontSize: '14px' }}>
      <div className="flex flex-col gap-2">
        <h1 className="dashboard-title" style={{ fontSize: '16px', fontWeight: '700', lineHeight: '1.2' }}>
          {getGreeting()}, {firstName}!
        </h1>
        <p className="dashboard-subtitle" style={{ fontSize: '12px', fontWeight: '400', lineHeight: '1.5' }}>
          Your assigned work for today.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Upcoming inspections */}
        <Card style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: '120px' }}>
          <CardHeader style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', flexShrink: 0, borderBottom: '1px solid var(--re-border)' }}>
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
              <CardTitle style={{ fontSize: '14px', fontWeight: '600', lineHeight: '1.3', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>Upcoming Inspections</CardTitle>
            </div>
            {inspections.length > 0 && (
              <Badge variant="secondary" style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: '500', whiteSpace: 'nowrap', flexShrink: 0 }}>{inspections.length}</Badge>
            )}
          </CardHeader>
          <CardContent style={{ padding: '8px 12px', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {inspections.length === 0 ? (
              <p className="text-sm text-muted-foreground">No scheduled inspections.</p>
            ) : (
              <ul style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflow: 'hidden' }}>
                {inspections.slice(0, 5).map((insp: any) => (
                  <li key={insp.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', fontSize: '12px', lineHeight: '1.3', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <span className="font-medium truncate">{insp.property_name ?? "â"}</span>
                    <Badge variant="outline" className="shrink-0 ml-2 capitalize">{insp.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Open maintenance issues */}
        <Card style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: '120px' }}>
          <CardHeader style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', flexShrink: 0, borderBottom: '1px solid var(--re-border)' }}>
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-muted-foreground" />
              <CardTitle style={{ fontSize: '14px', fontWeight: '600', lineHeight: '1.3', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>Open Maintenance Requests</CardTitle>
            </div>
            {openIssues.length > 0 && (
              <Badge variant="destructive" style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: '500', whiteSpace: 'nowrap', flexShrink: 0 }}>{openIssues.length}</Badge>
            )}
          </CardHeader>
          <CardContent style={{ padding: '8px 12px', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {openIssues.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open issues.</p>
            ) : (
              <ul style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflow: 'hidden' }}>
                {openIssues.slice(0, 5).map((issue: any) => (
                  <li key={issue.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', fontSize: '12px', lineHeight: '1.3', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <span className="font-medium truncate">{issue.title ?? "Untitled"}</span>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      {issue.priority === "high" || issue.priority === "urgent" ? (
                        <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                      ) : null}
                      <Badge variant="outline" className="capitalize">{issue.status}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <ActivityTimeline />
    </div>
  );
}

// ── Manager dashboard ─────────────────────────────────────────────────────────
// Managers see operational stats but no revenue/financial analytics.

function ManagerDashboard({ firstName }: { firstName: string }) {
  return (
    <div className="space-y-8" style={{ fontSize: '14px' }}>
      <div className="flex flex-col gap-2">
        <h1 className="dashboard-title" style={{ fontSize: '16px', fontWeight: '700', lineHeight: '1.2' }}>
          {getGreeting()}, {firstName}!
        </h1>
        <p className="dashboard-subtitle" style={{ fontSize: '12px', fontWeight: '400', lineHeight: '1.5' }}>
          Property management overview.
        </p>
      </div>

      <StatsGrid />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2">
          <PendingRentWidget />
        </div>
        <ActivityTimeline />
      </div>
    </div>
  );
}

// ── Owner / Superadmin dashboard ──────────────────────────────────────────────

function OwnerDashboard({ firstName }: { firstName: string }) {
  return (
    <div className="space-y-8" style={{ fontSize: '14px' }}>
      <div className="flex flex-col gap-2">
        <h1 className="dashboard-title" style={{ fontSize: '16px', fontWeight: '700', lineHeight: '1.2' }}>
          {getGreeting()}, {firstName}!
        </h1>
        <p className="dashboard-subtitle" style={{ fontSize: '12px', fontWeight: '400', lineHeight: '1.5' }}>
          Here&apos;s what&apos;s happening with your portfolio today.
        </p>
      </div>

      <StatsGrid />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2">
          <RevenueChart />
        </div>
        <TopProperties />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2">
          <PendingRentWidget />
        </div>
        <ActivityTimeline />
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const user = useAppStore((s) => s.user);
  const isAuthInitialized = useAppStore((s) => s.isAuthInitialized);
  const { isTenant, isMaintenance, isManager, isOwnerOrAbove } = usePermissions();

  const firstName = user?.name?.split(" ")[0] ?? "there";

  // Redirect tenants to their portal — they have no business on the staff dashboard.
  useEffect(() => {
    if (isAuthInitialized && isTenant && !isOwnerOrAbove && !isManager) {
      router.replace("/portal");
    }
  }, [isAuthInitialized, isTenant, isOwnerOrAbove, isManager, router]);

  if (!isAuthInitialized) return null;

  // Tenant: redirect in progress — render nothing to avoid flash.
  if (isTenant && !isOwnerOrAbove && !isManager) return null;

  if (isMaintenance && !isOwnerOrAbove && !isManager) {
    return <MaintenanceDashboard firstName={firstName} />;
  }

  // Managers get operational view without revenue analytics.
  if (isManager && !isOwnerOrAbove) {
    return <ManagerDashboard firstName={firstName} />;
  }

  // Owner / superadmin (and superadmin+manager combos) get full view.
  return <OwnerDashboard firstName={firstName} />;
}
