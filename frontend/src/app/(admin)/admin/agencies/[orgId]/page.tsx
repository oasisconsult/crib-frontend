"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Users,
  UserCheck,
  Home,
  TrendingUp,
  ExternalLink,
  Loader2,
  Archive,
  MapPin,
  Mail,
  Phone,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PermissionGate } from "@/components/common/PermissionGate";
import { useAdminAgency } from "@/hooks/useAdminOrgs";
import { formatCurrency } from "@/utils/formatters";
import { cn } from "@/utils/cn";
import type { AgencyProperty, AgencyManager, AgencyLandlord } from "@/services/api/adminOrgs";

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

export default function AgencyDetailPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const router = useRouter();
  const { data: agency, isLoading, error } = useAdminAgency(orgId);

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
            <div className="flex h-10 w-10 items-center justify-center rounded-[6px] bg-violet-100 text-violet-600 dark:bg-violet-950/30 shrink-0">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold tracking-tight truncate">
                  {isLoading ? "Loading…" : (agency?.name ?? "Agency")}
                </h1>
                {agency?.isArchived && (
                  <Badge variant="outline" className="text-xs text-muted-foreground shrink-0">
                    <Archive className="h-3 w-3 mr-1" />
                    Archived
                  </Badge>
                )}
              </div>
              {agency && (
                <p className="text-sm text-muted-foreground truncate">
                  {agency.slug} · {agency.plan} plan{agency.country ? ` · ${agency.country}` : ""}
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
              Failed to load agency details.
            </CardContent>
          </Card>
        )}

        {agency && (
          <>
            {/* ── Stats ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard
                icon={Home}
                label="Total Properties"
                value={agency.totalProperties}
                color="text-blue-600"
                bg="bg-blue-100 dark:bg-blue-950/30"
              />
              <StatCard
                icon={Home}
                label="Active"
                value={agency.activeProperties}
                color="text-emerald-600"
                bg="bg-emerald-100 dark:bg-emerald-950/30"
              />
              <StatCard
                icon={Users}
                label="Managers"
                value={agency.managerCount}
                color="text-violet-600"
                bg="bg-violet-100 dark:bg-violet-950/30"
              />
              <StatCard
                icon={UserCheck}
                label="Landlords"
                value={agency.landlordCount}
                color="text-sky-600"
                bg="bg-sky-100 dark:bg-sky-950/30"
              />
            </div>

            {/* ── Revenue + contact row ── */}
            <div className="grid sm:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-emerald-600" />
                    Monthly Revenue (occupied units)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                    {formatCurrency(agency.totalMonthlyRevenue, agency.currency ?? "UGX")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Across {agency.activeProperties} active{" "}
                    {agency.activeProperties === 1 ? "property" : "properties"}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Contact Info</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {agency.contactEmail ? (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate">{agency.contactEmail}</span>
                    </div>
                  ) : null}
                  {agency.contactPhone ? (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span>{agency.contactPhone}</span>
                    </div>
                  ) : null}
                  {agency.address ? (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate">{typeof agency.address === "string" ? agency.address : ""}</span>
                    </div>
                  ) : null}
                  {!agency.contactEmail && !agency.contactPhone && !agency.address && (
                    <p className="text-xs text-muted-foreground">No contact info on record</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* ── Managers ── */}
            {agency.managers.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Users className="h-4 w-4 text-violet-600" />
                    Managers
                    <span className="text-xs text-muted-foreground font-normal">
                      {agency.managers.length}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="divide-y">
                    {agency.managers.map((m: AgencyManager) => (
                      <div key={m.id} className="flex items-center gap-3 py-2.5">
                        <div className="h-7 w-7 rounded-full bg-violet-100 dark:bg-violet-950/30 flex items-center justify-center text-xs font-semibold text-violet-700 dark:text-violet-300 shrink-0">
                          {(m.displayName ?? m.email ?? "?")
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{m.displayName ?? "—"}</p>
                          <p className="text-xs text-muted-foreground truncate">{m.email ?? "—"}</p>
                        </div>
                        <Badge variant="outline" className="ml-auto shrink-0 text-xs capitalize">
                          {m.role}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Landlords ── */}
            {agency.landlords.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-sky-600" />
                    Landlords
                    <span className="text-xs text-muted-foreground font-normal">
                      {agency.landlords.length}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="divide-y">
                    {agency.landlords.map((ll: AgencyLandlord) => (
                      <div
                        key={ll.id}
                        className="flex items-center gap-3 py-2.5 cursor-pointer hover:bg-primary/5 rounded-[6px] px-1 -mx-1 transition-colors"
                        onClick={() => router.push(`/admin/landlords/${ll.id}`)}
                      >
                        <div className="h-7 w-7 rounded-full bg-sky-100 dark:bg-sky-950/30 flex items-center justify-center text-xs font-semibold text-sky-700 dark:text-sky-300 shrink-0">
                          {(ll.displayName ?? ll.email ?? "?")
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{ll.displayName ?? "—"}</p>
                          <p className="text-xs text-muted-foreground truncate">{ll.email ?? "—"}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-muted-foreground">
                            {ll.propertyCount} {ll.propertyCount === 1 ? "property" : "properties"}
                          </span>
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Properties ── */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Home className="h-4 w-4 text-blue-600" />
                  Properties
                  <span className="text-xs text-muted-foreground font-normal">
                    {agency.totalProperties} total
                  </span>
                </CardTitle>
                <CardDescription>
                  {agency.activeProperties} active · {agency.inactiveProperties} inactive
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {agency.properties.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No properties assigned to this agency
                  </p>
                ) : (
                  <div className="divide-y">
                    {agency.properties.map((p: AgencyProperty) => (
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
                          </div>
                          {p.address && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">{p.address}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0 space-y-0.5">
                          <p className="text-xs text-muted-foreground">
                            {p.unitCount} {p.unitCount === 1 ? "unit" : "units"}
                          </p>
                          {p.monthlyRevenue > 0 && (
                            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                              {formatCurrency(p.monthlyRevenue, agency.currency ?? "UGX")}
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
