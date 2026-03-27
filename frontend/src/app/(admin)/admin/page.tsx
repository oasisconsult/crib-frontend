"use client";

import { useState } from "react";
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
  HardDrive,
  Cpu,
  MoreHorizontal,
  Search,
  Plus,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { PermissionGate } from "@/components/common/PermissionGate";
import { cn } from "@/utils/cn";

const MOCK_USERS = [
  { id: "1", name: "Tendo Mukasa",    email: "tendo@crib.ug",   role: "landlord", properties: 3, status: "active",   joined: "Jan 2026" },
  { id: "2", name: "Grace Nabirye",   email: "grace@crib.ug",   role: "landlord", properties: 1, status: "active",   joined: "Feb 2026" },
  { id: "3", name: "Brian Ssempala",  email: "brian@crib.ug",   role: "tenant",   properties: 0, status: "active",   joined: "Feb 2026" },
  { id: "4", name: "Fatuma Nakato",   email: "fatuma@crib.ug",  role: "tenant",   properties: 0, status: "active",   joined: "Mar 2026" },
  { id: "5", name: "Ronald Kiggundu", email: "ronald@crib.ug",  role: "landlord", properties: 2, status: "inactive", joined: "Jan 2026" },
  { id: "6", name: "Aisha Namusoke",  email: "aisha@crib.ug",   role: "tenant",   properties: 0, status: "pending",  joined: "Mar 2026" },
];

const SYSTEM_SERVICES = [
  { service: "API Server",     status: "healthy",  latency: "12ms" },
  { service: "PostgreSQL",     status: "healthy",  latency: "4ms"  },
  { service: "Redis Cache",    status: "healthy",  latency: "1ms"  },
  { service: "MinIO Storage",  status: "healthy",  latency: "8ms"  },
  { service: "Logto Auth",     status: "healthy",  latency: "22ms" },
  { service: "SMS Gateway",    status: "degraded", latency: "340ms"},
];

const STATS = [
  { label: "Landlords",   value: "3",   icon: Building2, color: "text-blue-600",    bg: "bg-blue-100 dark:bg-blue-950/30"    },
  { label: "Tenants",     value: "4",   icon: Users,     color: "text-violet-600",  bg: "bg-violet-100 dark:bg-violet-950/30"},
  { label: "Properties",  value: "6",   icon: Database,  color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-950/30"},
  { label: "System Health", value: "98%", icon: Activity, color: "text-green-600",  bg: "bg-green-100 dark:bg-green-950/30"  },
];

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

function Avatar({ name }: { name: string }) {
  return (
    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
      {name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
    </div>
  );
}

export default function AdminPage() {
  const [tab, setTab] = useState("users");
  const [search, setSearch] = useState("");

  const filteredUsers = MOCK_USERS.filter(
    (u) =>
      !search ||
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()),
  );

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
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-950/30">
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
          {STATS.map((s) => (
            <Card key={s.label}>
              <CardContent className="pt-4 pb-3">
                <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center mb-2", s.bg)}>
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
          <TabsList>
            <TabsTrigger value="users">
              <Users className="h-3.5 w-3.5 mr-1.5" />
              Users
            </TabsTrigger>
            <TabsTrigger value="system">
              <Server className="h-3.5 w-3.5 mr-1.5" />
              System
            </TabsTrigger>
            <TabsTrigger value="gdpr">
              <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
              Compliance
            </TabsTrigger>
          </TabsList>

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
                        className="h-8 w-48 rounded-md border border-input bg-background pl-8 pr-3 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                {/* Table header */}
                <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-3 py-2 text-xs font-medium text-muted-foreground border-b">
                  <span>User</span>
                  <span>Role</span>
                  <span className="text-center">Properties</span>
                  <span>Joined</span>
                  <span>Status</span>
                </div>

                <div className="divide-y">
                  {filteredUsers.map((u) => {
                    const sc = STATUS_CONFIG[u.status] ?? STATUS_CONFIG.inactive;
                    return (
                      <div
                        key={u.id}
                        className="grid sm:grid-cols-[1fr_auto_auto_auto_auto] gap-3 sm:gap-4 items-center py-3 px-3 hover:bg-muted/30 rounded-lg transition-colors"
                      >
                        {/* User info */}
                        <div className="flex items-center gap-3">
                          <Avatar name={u.name} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{u.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                          </div>
                        </div>

                        {/* Role */}
                        <Badge variant="outline" className="text-xs capitalize w-fit">
                          {u.role}
                        </Badge>

                        {/* Properties */}
                        <span className="text-xs text-muted-foreground text-center hidden sm:block">
                          {u.properties > 0 ? u.properties : "—"}
                        </span>

                        {/* Joined */}
                        <span className="text-xs text-muted-foreground hidden sm:block whitespace-nowrap">
                          {u.joined}
                        </span>

                        {/* Status + actions */}
                        <div className="flex items-center gap-2 justify-end">
                          <Badge variant={sc.variant} className="text-xs hidden sm:inline-flex">
                            {sc.label}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {filteredUsers.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">No users match your search</p>
                )}
              </CardContent>
            </Card>

            {/* Role breakdown */}
            <div className="grid sm:grid-cols-3 gap-3">
              {[
                { label: "Active",   count: MOCK_USERS.filter((u) => u.status === "active").length,   icon: UserCheck, color: "text-emerald-600" },
                { label: "Pending",  count: MOCK_USERS.filter((u) => u.status === "pending").length,  icon: Clock,     color: "text-amber-600"   },
                { label: "Inactive", count: MOCK_USERS.filter((u) => u.status === "inactive").length, icon: UserX,     color: "text-muted-foreground" },
              ].map((s) => (
                <Card key={s.label}>
                  <CardContent className="flex items-center gap-3 pt-4 pb-3">
                    <s.icon className={cn("h-5 w-5", s.color)} />
                    <div>
                      <p className="text-xs text-muted-foreground">{s.label} Users</p>
                      <p className="text-xl font-bold">{s.count}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* ─── System tab ──────────────────────────────────── */}
          <TabsContent value="system" className="mt-4 space-y-4">
            <div className="grid sm:grid-cols-3 gap-3">
              {[
                { label: "CPU Usage",    value: "18%",  icon: Cpu,       color: "text-sky-600"     },
                { label: "Memory",       value: "2.1GB",icon: Server,    color: "text-violet-600"  },
                { label: "Disk Used",    value: "34%",  icon: HardDrive, color: "text-amber-600"   },
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
                {SYSTEM_SERVICES.map((s, i) => {
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
                          <span className="text-xs text-muted-foreground">{s.latency}</span>
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
                })}
              </CardContent>
            </Card>
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
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4 text-sm text-amber-800 dark:text-amber-200">
                  Actions in this section are <strong>irreversible</strong>. Proceed only after verifying the request is legitimate.
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-medium">Anonymise Tenant Data</p>
                  <p className="text-xs text-muted-foreground">
                    Permanently redacts a tenant&apos;s personal information. Complies with Art. 22 of the Uganda Data Protection and Privacy Act.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Tenant ID (e.g. tenant-3)..."
                      className="flex h-9 flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                    <Button variant="destructive" size="sm">
                      Anonymise
                    </Button>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <p className="text-sm font-medium">Export User Data</p>
                  <p className="text-xs text-muted-foreground">
                    Generate a full data export for a user (right to portability).
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="User ID or email..."
                      className="flex h-9 flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
        </Tabs>
      </div>
    </PermissionGate>
  );
}
