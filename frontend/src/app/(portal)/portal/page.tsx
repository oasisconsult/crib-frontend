"use client";

import { useState } from "react";
import { Home, CreditCard, FileText, MessageSquare, Bell } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/common/StatusBadge";
import { formatCurrency, formatDate } from "@/utils/formatters";
import { usePayments } from "@/hooks/usePayments";
import { useLeases } from "@/hooks/useLeases";

export default function TenantPortalPage() {
  const [tab, setTab] = useState("overview");
  const { data: leases } = useLeases();
  const { data: payments } = usePayments();

  const myLease = leases?.data?.[0];
  const recentPayments = (payments?.data ?? []).slice(0, 5);

  return (
    <div className="min-h-screen bg-muted/30 p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Home className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Tenant Portal</h1>
            <p className="text-sm text-muted-foreground">Manage your tenancy</p>
          </div>
        </div>

        {/* Current Lease Banner */}
        {myLease && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Current Lease</p>
                  <p className="font-mono font-medium">{myLease.reference}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {formatDate(myLease.terms.startDate)} — {formatDate(myLease.terms.endDate)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Monthly Rent</p>
                  <p className="text-xl font-bold">
                    {formatCurrency(myLease.terms.monthlyRent, myLease.terms.currency)}
                  </p>
                </div>
                <StatusBadge state={myLease.state} domain="lease" />
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="overview">
              <Home className="h-3.5 w-3.5" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="payments">
              <CreditCard className="h-3.5 w-3.5" />
              Payments
            </TabsTrigger>
            <TabsTrigger value="documents">
              <FileText className="h-3.5 w-3.5" />
              Documents
            </TabsTrigger>
            <TabsTrigger value="requests">
              <MessageSquare className="h-3.5 w-3.5" />
              Requests
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: "Rent Status", value: "Up to date", color: "text-emerald-600" },
                { label: "Next Payment", value: "Apr 1, 2025", color: "text-foreground" },
                { label: "Open Requests", value: "0", color: "text-foreground" },
              ].map((s) => (
                <Card key={s.label}>
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className={`text-lg font-bold mt-0.5 ${s.color}`}>{s.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Pay Rent", icon: CreditCard, onClick: () => setTab("payments") },
                  { label: "Submit Request", icon: MessageSquare, onClick: () => setTab("requests") },
                  { label: "View Documents", icon: FileText, onClick: () => setTab("documents") },
                  { label: "Notifications", icon: Bell, onClick: () => {} },
                ].map((a) => (
                  <button
                    key={a.label}
                    onClick={a.onClick}
                    className="flex flex-col items-center gap-2 p-3 rounded-lg border border-border hover:bg-muted/50 hover:border-primary/30 transition-all text-sm"
                  >
                    <a.icon className="h-5 w-5 text-primary" />
                    {a.label}
                  </button>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payments" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Payment History</CardTitle>
              </CardHeader>
              <CardContent>
                {recentPayments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No payment history yet.</p>
                ) : (
                  <div className="space-y-2">
                    {recentPayments.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
                      >
                        <div>
                          <p className="text-sm font-medium font-mono">{p.reference}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(p.dueDate)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">{formatCurrency(p.amount, p.currency)}</p>
                          <StatusBadge state={p.state} domain="payment" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="documents" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground text-center py-8">
                  Your lease documents and agreements will appear here.
                </p>
                {myLease && (
                  <div className="flex justify-center">
                    <Button variant="outline" size="sm">
                      <FileText className="h-4 w-4" />
                      Download Lease Agreement
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="requests" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground text-center py-4">
                  Submit maintenance requests or contact your landlord.
                </p>
                <div className="flex justify-center">
                  <Button size="sm">
                    <MessageSquare className="h-4 w-4" />
                    New Maintenance Request
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
