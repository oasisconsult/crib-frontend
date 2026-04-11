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
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">
          {getGreeting()}, {firstName}!
        </h1>
        <p className="text-sm text-muted-foreground">
          Your assigned work for today.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Upcoming inspections */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 pb-4">
            <ClipboardList className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Upcoming Inspections</CardTitle>
            {inspections.length > 0 && (
              <Badge variant="secondary" className="ml-auto">{inspections.length}</Badge>
            )}
          </CardHeader>
          <CardContent>
            {inspections.length === 0 ? (
              <p className="text-sm text-muted-foreground">No scheduled inspections.</p>
            ) : (
              <ul className="space-y-3">
                {inspections.slice(0, 5).map((insp: any) => (
                  <li key={insp.id} className="flex items-center justify-between text-sm">
                    <span className="font-medium truncate">{insp.property_name ?? "â"}</span>
                    <Badge variant="outline" className="shrink-0 ml-2 capitalize">{insp.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Open maintenance issues */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 pb-4">
            <Wrench className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Open Maintenance Requests</CardTitle>
            {openIssues.length > 0 && (
              <Badge variant="destructive" className="ml-auto">{openIssues.length}</Badge>
            )}
          </CardHeader>
          <CardContent>
            {openIssues.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open issues.</p>
            ) : (
              <ul className="space-y-3">
                {openIssues.slice(0, 5).map((issue: any) => (
                  <li key={issue.id} className="flex items-center justify-between text-sm">
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
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">
          {getGreeting()}, {firstName}!
        </h1>
        <p className="text-sm text-muted-foreground">
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
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">
          {getGreeting()}, {firstName}!
        </h1>
        <p className="text-sm text-muted-foreground">
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
