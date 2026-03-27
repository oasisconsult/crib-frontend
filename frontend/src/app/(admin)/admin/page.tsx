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
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PermissionGate } from "@/components/common/PermissionGate";

const MOCK_USERS = [
  { id: "1", name: "Alice Kamau", email: "alice@crib.ke", role: "landlord", properties: 3, status: "active" },
  { id: "2", name: "Bob Mwangi", email: "bob@crib.ke", role: "landlord", properties: 1, status: "active" },
  { id: "3", name: "Carol Odhiambo", email: "carol@crib.ke", role: "tenant", properties: 0, status: "active" },
];

export default function AdminPage() {
  const [tab, setTab] = useState("users");

  return (
    <PermissionGate role="superadmin" fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-3">
          <Shield className="h-12 w-12 text-muted-foreground mx-auto" />
          <h2 className="text-lg font-semibold">Access Denied</h2>
          <p className="text-sm text-muted-foreground">
            This area is restricted to super admins only.
          </p>
        </div>
      </div>
    }>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-950/30">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Super Admin</h1>
            <p className="text-sm text-muted-foreground">Platform administration</p>
          </div>
          <Badge variant="destructive" className="ml-auto">Admin Only</Badge>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total Landlords", value: "2", icon: Building2 },
            { label: "Total Tenants", value: "3", icon: Users },
            { label: "Total Properties", value: "3", icon: Database },
            { label: "System Health", value: "100%", icon: Activity },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="pt-4">
                <s.icon className="h-4 w-4 text-muted-foreground mb-2" />
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-2xl font-bold mt-0.5">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="system">System</TabsTrigger>
            <TabsTrigger value="gdpr">GDPR</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Platform Users</CardTitle>
                <CardDescription>Manage all landlords and tenants</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {MOCK_USERS.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center justify-between py-2.5 px-3 rounded-lg border border-border hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                          {u.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{u.name}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs capitalize">{u.role}</Badge>
                        {u.properties > 0 && (
                          <span className="text-xs text-muted-foreground">{u.properties} props</span>
                        )}
                        <Button variant="ghost" size="icon-sm" className="text-red-600 hover:text-red-700">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="system" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">System Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { service: "API Server", status: "healthy" },
                  { service: "Database", status: "healthy" },
                  { service: "Redis Cache", status: "healthy" },
                  { service: "MinIO Storage", status: "healthy" },
                  { service: "Logto Auth", status: "healthy" },
                ].map((s) => (
                  <div key={s.service} className="flex items-center justify-between text-sm">
                    <span>{s.service}</span>
                    <Badge variant="success" className="text-xs">{s.status}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="gdpr" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  GDPR & Data Management
                </CardTitle>
                <CardDescription>
                  Data subject requests and compliance tools
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4 text-sm text-amber-800 dark:text-amber-200">
                  Anonymise a tenant&apos;s personal data permanently. This action cannot be undone.
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Anonymise Tenant Data</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Tenant ID..."
                      className="flex h-9 flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm"
                    />
                    <Button variant="destructive" size="sm">
                      Anonymise
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </PermissionGate>
  );
}
