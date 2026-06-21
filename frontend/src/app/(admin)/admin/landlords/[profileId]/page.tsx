"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Home,
  TrendingUp,
  Loader2,
  UserCheck,
  Building2,
  ExternalLink,
  MapPin,
  Mail,
  Phone,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PermissionGate } from "@/components/common/PermissionGate";
import { useAdminLandlord } from "@/hooks/useAdminOrgs";
import { formatCurrency } from "@/utils/formatters";
import { cn } from "@/utils/cn";
import type { LandlordProperty } from "@/services/api/adminOrgs";

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  bg,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
  bg: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className={cn("h-8 w-8 rounded-[6px] flex items-center justify-center mb-2", bg)}>
          <Icon className={cn("h-4 w-4", color)} />
        </div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("text-2xl font-bold mt-0.5", color)}>{value}</p>
      </CardContent>
    </Card>
  );
}

const STATUS_CLASS: Record<string, string> = {
  active:      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-300",
  inactive:    "bg-muted text-muted-foreground border-border",
  maintenance: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-300",
};

export default function LandlordDetailPage({ params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = use(params);
  const router = useRouter();
  const { data: landlord, isLoading, error } = useAdminLandlord(profileId);

  const isIndependent = landlord?.type === "independent";

  return (
    <PermissionGate
      role="superadmin"
      fallback={
        <div className="flex items-center justify-center py-24">
          <p className="text-sm text-muted-foreground">Access denied</p>
        </div>
      }
    >
      <div className="space-y-6">
        {/* ── Back + header ── */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.back()} className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3 min-w-0">
            <div className={cn(
              "h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0",
              isIndependent
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                : "bg-sky-100 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300"
            )}>
              {(landlord?.displayName ?? landlord?.email ?? "?")
                .split(" ")
                .map((n: string) => n[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold tracking-tight truncate">
                  {isLoading ? "Loading…" : (landlord?.displayName ?? landlord?.email ?? "Landlord")}
                </h1>
                {landlord && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs shrink-0",
                      isIndependent
                        ? "text-emerald-700 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 dark:text-emerald-300"
                        : "text-sky-700 border-sky-300 bg-sky-50 dark:bg-sky-950/20 dark:text-sky-300"
                    )}
                  >
                    {isIndependent ? "Independent" : "Agency Managed"}
                  </Badge>
                )}
              </div>
              {landlord && (
                <p className="text-sm text-muted-foreground truncate">
                  {landlord.email}
                  {landlord.orgName ? ` · ${landlord.orgName}` : ""}
                </p>
              )}
            </div>
          </div>
        </div>

        {isLoading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Failed to load landlord details.
            </CardContent>
          </Card>
        )}

        {landlord && (
          <>
            {/* ── Stats ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard
                icon={Home}
                label="Total Properties"
                value={landlord.propertyCount}
                color="text-blue-600"
                bg="bg-blue-100 dark:bg-blue-950/30"
              />
              <StatCard
                icon={Home}
                label="Active"
                value={landlord.activePropertyCount}
                color="text-emerald-600"
                bg="bg-emerald-100 dark:bg-emerald-950/30"
              />
              <StatCard
                icon={Home}
                label="Inactive"
                value={landlord.inactivePropertyCount}
                color="text-amber-600"
                bg="bg-amber-100 dark:bg-amber-950/30"
              />
              <StatCard
                icon={TrendingUp}
                label="Monthly Revenue"
                value={formatCurrency(landlord.totalMonthlyRevenue, "UGX")}
                color="text-violet-600"
                bg="bg-violet-100 dark:bg-violet-950/30"
              />
            </div>

            {/* ── Info cards ── */}
            <div className="grid sm:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <UserCheck className="h-4 w-4" />
                    Profile Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {landlord.email && (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate">{landlord.email}</span>
                    </div>
                  )}
                  {landlord.phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span>{landlord.phone}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground text-xs">Role:</span>
                    <Badge variant="outline" className="text-xs capitalize">{landlord.role}</Badge>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground text-xs">Joined:</span>
                    <span className="text-xs">
                      {new Date(landlord.createdAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Organisation
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {landlord.orgName ? (
                    <>
                      <p className="text-sm font-medium">{landlord.orgName}</p>
                      {landlord.orgId && (
                        <p className="font-mono text-xs text-muted-foreground truncate">
                          {landlord.orgId}
                        </p>
                      )}
                      {!isIndependent && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => router.push(`/admin/agencies/${landlord.orgId}`)}
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          View Agency
                        </Button>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">No organisation linked</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* ── Properties ── */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Home className="h-4 w-4 text-blue-600" />
                  Properties
                  <span className="text-xs text-muted-foreground font-normal">
                    {landlord.propertyCount} total
                  </span>
                </CardTitle>
                <CardDescription>
                  {landlord.activePropertyCount} active · {landlord.inactivePropertyCount} inactive
                  {isIndependent
                    ? " · Independent (full owner)"
                    : " · Agency managed (read-only access)"}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {landlord.properties.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No properties assigned to this landlord
                  </p>
                ) : (
                  <div className="divide-y">
                    {landlord.properties.map((p: LandlordProperty) => (
                      <div key={p.id} className="flex items-center gap-3 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium truncate">{p.name}</p>
                            <Badge
                              variant="outline"
                              className={cn("text-xs capitalize shrink-0", STATUS_CLASS[p.status] ?? STATUS_CLASS.inactive)}
                            >
                              {p.status}
                            </Badge>
                            <span className="text-xs text-muted-foreground capitalize shrink-0">
                              {p.type.replace(/_/g, " ")}
                            </span>
                          </div>
                          {p.address && (
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                              <p className="text-xs text-muted-foreground truncate">{p.address}</p>
                            </div>
                          )}
                        </div>
                        <div className="text-right shrink-0 space-y-0.5">
                          <p className="text-xs text-muted-foreground">
                            {p.unitCount} {p.unitCount === 1 ? "unit" : "units"}
                          </p>
                          {p.monthlyRevenue > 0 && (
                            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                              {formatCurrency(p.monthlyRevenue, "UGX")}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </PermissionGate>
  );
}
