"use client";

import { Layout } from "@/components/layout/Navigation";
import { StatsGrid } from "@/components/dashboard/StatsGrid";
import { ActivityTimeline } from "@/components/dashboard/ActivityTimeline";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { PendingRentWidget } from "@/components/dashboard/PendingRentWidget";
import { 
  PageHeader, 
  DashboardCardSkeleton, 
  EmptyState,
  SearchBar,
  FilterButton,
  ActionButtons
} from "@/components/ui/UXPatterns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  ClipboardList, 
  Wrench, 
  AlertCircle, 
  TrendingUp,
  TrendingDown,
  DollarSign,
  Home,
  Users,
  Calendar,
  FileText,
  Plus
} from "lucide-react";
import { useInspections, useMaintenanceIssues } from "@/hooks/useInspections";
import { cn } from "@/utils/cn";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import { usePermissions } from "@/hooks/usePermissions";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

// KPI Cards Component
function KPIDashboardCards() {
  const kpiData = [
    {
      title: "Total Properties",
      value: "24",
      trend: { value: "+2 this month", positive: true },
      icon: Home,
      color: "blue"
    },
    {
      title: "Active Tenants",
      value: "18",
      trend: { value: "+1 this week", positive: true },
      icon: Users,
      color: "green"
    },
    {
      title: "Monthly Revenue",
      value: "$12,450",
      trend: { value: "+8.3% vs last month", positive: true },
      icon: DollarSign,
      color: "purple"
    },
    {
      title: "Pending Tasks",
      value: "7",
      trend: { value: "-3 from yesterday", positive: true },
      icon: FileText,
      color: "orange"
    }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {kpiData.map((kpi, index) => {
        const Icon = kpi.icon;
        const TrendIcon = kpi.trend.positive ? TrendingUp : TrendingDown;
        
        return (
          <div key={index} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 h-36 hover:shadow-md transition-shadow">
            <div className="flex flex-col justify-between h-full">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0",
                  kpi.color === "blue" && "bg-blue-100",
                  kpi.color === "green" && "bg-green-100",
                  kpi.color === "purple" && "bg-purple-100",
                  kpi.color === "orange" && "bg-orange-100"
                )}>
                  <Icon className={cn(
                    "w-6 h-6",
                    kpi.color === "blue" && "text-blue-600",
                    kpi.color === "green" && "text-green-600",
                    kpi.color === "purple" && "text-purple-600",
                    kpi.color === "orange" && "text-orange-600"
                  )} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600 mb-1">{kpi.title}</p>
                  <p className="text-2xl font-bold text-gray-900">{kpi.value}</p>
                </div>
              </div>
              <div className={cn(
                "flex items-center text-sm mt-4",
                kpi.trend.positive ? "text-green-600" : "text-red-600"
              )}>
                <TrendIcon className="w-4 h-4 mr-1" />
                {kpi.trend.value}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Maintenance Dashboard
function MaintenanceDashboard({ firstName }: { firstName: string }) {
  const { data: inspectionsData, isLoading: inspectionsLoading } = useInspections({ 
    filters: [{ field: "status", operator: "in", value: ["scheduled", "in_progress"] }] 
  });
  const { data: maintenanceData, isLoading: maintenanceLoading } = useMaintenanceIssues();

  const inspections = inspectionsData?.data ?? [];
  const issues = maintenanceData?.data ?? [];
  const openIssues = issues.filter(
    (i: any) => i.status === "open" || i.status === "in_progress",
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title={`${getGreeting()}, ${firstName}!`}
        subtitle="Your assigned work for today"
        actions={
          <div className="flex items-center gap-3">
            <SearchBar
              value=""
              onChange={() => {}}
              placeholder="Search tasks..."
              className="w-64"
            />
            <FilterButton activeFilters={0} onClick={() => {}} />
          </div>
        }
      />

      {/* KPI Cards */}
      <KPIDashboardCards />

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Upcoming inspections */}
        <Card className="bg-white rounded-xl shadow-sm border border-gray-200">
          <CardHeader className="px-6 pt-6 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <ClipboardList className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <CardTitle className="text-lg font-semibold text-gray-900">Upcoming Inspections</CardTitle>
                  <p className="text-sm text-gray-600">Scheduled and in-progress</p>
                </div>
              </div>
              {inspections.length > 0 && (
                <Badge className="bg-blue-100 text-blue-700 px-2 py-1 text-xs font-medium">{inspections.length}</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            {inspectionsLoading ? (
              <DashboardCardSkeleton />
            ) : inspections.length === 0 ? (
              <EmptyState
                icon={<ClipboardList className="w-8 h-8" />}
                title="No inspections scheduled"
                description="You don't have any upcoming inspections."
                action={{
                  label: "Schedule Inspection",
                  onClick: () => {},
                  icon: <Plus className="w-4 h-4" />
                }}
              />
            ) : (
              <div className="space-y-3">
                {inspections.slice(0, 5).map((insp: any) => (
                  <div key={insp.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{insp.property_name ?? "Unknown Property"}</p>
                      <p className="text-xs text-gray-600">{insp.date}</p>
                    </div>
                    <Badge className={cn(
                      "px-2 py-1 text-xs font-medium",
                      insp.status === "scheduled" ? "bg-yellow-100 text-yellow-700" : "bg-blue-100 text-blue-700"
                    )}>
                      {insp.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Open maintenance issues */}
        <Card className="bg-white rounded-xl shadow-sm border border-gray-200">
          <CardHeader className="px-6 pt-6 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                  <Wrench className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <CardTitle className="text-lg font-semibold text-gray-900">Open Maintenance Requests</CardTitle>
                  <p className="text-sm text-gray-600">Requiring attention</p>
                </div>
              </div>
              {openIssues.length > 0 && (
                <Badge className="bg-red-100 text-red-700 px-2 py-1 text-xs font-medium">{openIssues.length}</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            {maintenanceLoading ? (
              <DashboardCardSkeleton />
            ) : openIssues.length === 0 ? (
              <EmptyState
                icon={<Wrench className="w-8 h-8" />}
                title="No open issues"
                description="All maintenance requests have been resolved."
                action={{
                  label: "Create Request",
                  onClick: () => {},
                  icon: <Plus className="w-4 h-4" />
                }}
              />
            ) : (
              <div className="space-y-3">
                {openIssues.slice(0, 5).map((issue: any) => (
                  <div key={issue.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{issue.title ?? "Untitled Issue"}</p>
                      <p className="text-xs text-gray-600">{issue.property}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {(issue.priority === "high" || issue.priority === "urgent") && (
                        <AlertCircle className="w-4 h-4 text-red-500" />
                      )}
                      <Badge className={cn(
                        "px-2 py-1 text-xs font-medium",
                        issue.status === "open" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"
                      )}>
                        {issue.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activity Timeline */}
      <ActivityTimeline />
    </div>
  );
}

// Manager dashboard
function ManagerDashboard({ firstName }: { firstName: string }) {
  return (
    <div className="space-y-6">
      <PageHeader
        title={`${getGreeting()}, ${firstName}!`}
        subtitle="Property management overview"
        actions={
          <ActionButtons
            onExport={() => {}}
            onRefresh={() => {}}
          />
        }
      />

      <KPIDashboardCards />
      <StatsGrid />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <PendingRentWidget />
        </div>
        <div>
          <ActivityTimeline />
        </div>
      </div>
    </div>
  );
}

// Owner / Superadmin dashboard
function OwnerDashboard({ firstName }: { firstName: string }) {
  return (
    <div className="space-y-6">
      <PageHeader
        title={`${getGreeting()}, ${firstName}!`}
        subtitle="Here's what's happening with your portfolio today"
        actions={
          <ActionButtons
            onExport={() => {}}
            onRefresh={() => {}}
          />
        }
      />

      <KPIDashboardCards />
      <StatsGrid />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <RevenueChart />
        </div>
        <div>
          <ActivityTimeline />
        </div>
      </div>
    </div>
  );
}

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
