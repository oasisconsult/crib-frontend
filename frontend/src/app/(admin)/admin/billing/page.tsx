"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Check, X, Zap, Landmark, Users, HardDrive,
  Loader2, ArrowLeft, ChevronDown, ChevronUp,
  BarChart3, Wrench, FileText, MessageSquare,
  UserCheck, Phone,
  Key, Shield, ClipboardList, Settings,
  TrendingUp, TrendingDown, AlertCircle,
  Clock, RefreshCw, DollarSign, Activity,
  Search, Download, Eye, CheckCircle2, XCircle,
  Ban, RotateCcw, Calendar, ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { PageHeader } from "@/components/common/PageHeader";
import { PermissionGate } from "@/components/common/PermissionGate";
import {
  useAdminBillingSettings, useAdminUpdateBillingSettings,
  useAdminPlans, useAdminUpdatePlan,
  useAdminPendingPayments, useAdminVerifyPayment, useAdminRejectPayment,
  useAdminAnalytics, useAdminAnalyticsCharts,
  useAdminSubscriptions, useAdminSuspendSubscription, useAdminExtendSubscription,
} from "@/hooks/useSubscription";
import { toast } from "@/store/useUIStore";
import { cn } from "@/utils/cn";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import type { BillingSettings, SubscriptionPlan, AdminPayment, AdminSubscription } from "@/services/api/subscriptions";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatUGX(n: number | undefined | null) {
  const v = n ?? 0;
  if (v >= 1_000_000) return `UGX ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `UGX ${(v / 1_000).toFixed(0)}k`;
  return `UGX ${v.toLocaleString()}`;
}

function paymentMethodLabel(m: string) {
  const map: Record<string, string> = {
    mtn_momo: "MTN MoMo", airtel_money: "Airtel Money",
    bank_transfer: "Bank Transfer", cash: "Cash",
  };
  return map[m] ?? m;
}

const STATUS_BADGE: Record<string, { variant: "success" | "warning" | "destructive" | "outline" | "info" | "slate"; label: string }> = {
  active:               { variant: "success",     label: "Active"           },
  trialing:             { variant: "info",        label: "Trial"            },
  pending_payment:      { variant: "warning",     label: "Pending Payment"  },
  pending_verification: { variant: "warning",     label: "Verifying"        },
  grace_period:         { variant: "warning",     label: "Grace Period"     },
  suspended:            { variant: "destructive", label: "Suspended"        },
  cancelled:            { variant: "outline",     label: "Cancelled"        },
  expired:              { variant: "destructive", label: "Expired"          },
};

const CHART_COLORS = ["#239487", "#6366f1", "#f59e0b", "#ef4444", "#8b5cf6", "#10b981"];

// ── Analytics Tab ─────────────────────────────────────────────────────────────

function AnalyticsTab() {
  const { data: stats, isLoading: loadingStats } = useAdminAnalytics();
  const { data: charts, isLoading: loadingCharts } = useAdminAnalyticsCharts();

  const kpis = stats ? [
    { label: "Active Subscriptions", value: stats.totalActiveSubscriptions, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-500/15" },
    { label: "Pending Approvals",    value: stats.pendingVerifications,      icon: Clock,         color: "text-amber-600",   bg: "bg-amber-50 dark:bg-amber-500/15", highlight: stats.pendingVerifications > 0 },
    { label: "MRR (UGX)",            value: formatUGX(stats.mrrUgx),         icon: TrendingUp,    color: "text-primary",     bg: "bg-[hsl(var(--accent))]" },
    { label: "ARR (UGX)",            value: formatUGX(stats.arrUgx),         icon: DollarSign,    color: "text-primary",     bg: "bg-[hsl(var(--accent))]" },
    { label: "Revenue MTD",          value: formatUGX(stats.revenueMtdUgx),  icon: Activity,      color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-500/15" },
    { label: "Churn Rate (30d)",     value: `${stats.churnRate}%`,           icon: TrendingDown,  color: stats.churnRate > 5 ? "text-red-600" : "text-emerald-600", bg: stats.churnRate > 5 ? "bg-red-50 dark:bg-red-500/15" : "bg-emerald-50 dark:bg-emerald-500/15" },
    { label: "Trialing",             value: stats.totalTrialing,             icon: Zap,           color: "text-indigo-600",  bg: "bg-indigo-50 dark:bg-indigo-500/15" },
    { label: "Suspended",            value: stats.totalSuspended,            icon: Ban,           color: "text-red-600",     bg: "bg-red-50 dark:bg-red-500/15" },
  ] : [];

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      {loadingStats ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {kpis.map(({ label, value, icon: Icon, color, bg, highlight }) => (
            <Card key={label} className={cn(highlight && "ring-2 ring-amber-400 dark:ring-amber-500/50")}>
              <CardContent className="pt-4 pb-3">
                <div className={cn("h-9 w-9 rounded-[8px] flex items-center justify-center mb-3", bg)}>
                  <Icon className={cn("h-5 w-5", color)} aria-hidden />
                </div>
                <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
                <p className={cn("text-2xl font-bold tracking-tight", color)}>{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Charts */}
      {loadingCharts ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-64 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : charts && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Revenue Trend */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Revenue Trend (UGX)</CardTitle>
              <CardDescription className="text-xs">Monthly verified payments — last 12 months</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={charts.revenueTrend}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#239487" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#239487" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => v >= 1000 ? `${v/1000}k` : v} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v: number) => [`UGX ${v.toLocaleString()}`, "Revenue"]} />
                  <Area type="monotone" dataKey="revenue" stroke="#239487" strokeWidth={2} fill="url(#revGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* New vs Cancelled */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">New vs Cancelled Subscriptions</CardTitle>
              <CardDescription className="text-xs">Monthly comparison — last 12 months</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={charts.subscriptionGrowth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="new"       name="New"       fill="#239487" radius={[3,3,0,0]} />
                  <Bar dataKey="cancelled" name="Cancelled" fill="#ef4444" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Status Donut */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Subscription Status Distribution</CardTitle>
              <CardDescription className="text-xs">Current snapshot across all orgs</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={charts.statusDistribution}
                    dataKey="count"
                    nameKey="status"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {charts.statusDistribution.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v, name) => [v, STATUS_BADGE[name as string]?.label ?? name]} />
                  <Legend
                    formatter={name => STATUS_BADGE[name as string]?.label ?? name}
                    wrapperStyle={{ fontSize: 11 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Plan Distribution */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Active Subscriptions by Plan</CardTitle>
              <CardDescription className="text-xs">Paid (active + trialing) orgs per plan</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={charts.planDistribution} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} />
                  <YAxis dataKey="plan" type="category" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={80} />
                  <Tooltip />
                  <Bar dataKey="count" name="Subscriptions" radius={[0,3,3,0]}>
                    {charts.planDistribution.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ── Pending Approvals Tab ─────────────────────────────────────────────────────

function RejectModal({ payment, onClose }: { payment: AdminPayment; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const { mutate: reject, isPending } = useAdminRejectPayment();

  function handleReject() {
    if (!reason.trim() || reason.trim().length < 5) return;
    reject(
      { paymentId: payment.id, reason: reason.trim() },
      {
        onSuccess: () => { toast.success("Payment rejected"); onClose(); },
        onError: () => toast.error("Failed to reject payment"),
      }
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <XCircle className="h-4 w-4" /> Reject Payment
          </DialogTitle>
          <DialogDescription>
            This will reject the payment proof and return the subscription to
            &quot;Pending Payment&quot; status. The organisation will be notified.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="rounded-[8px] border border-[hsl(var(--border))] bg-muted/30 p-3 text-sm space-y-1">
            <p><span className="text-muted-foreground">Organisation:</span> <strong>{payment.orgName}</strong></p>
            <p><span className="text-muted-foreground">Amount:</span> <strong>{payment.currency} {payment.amount.toLocaleString()}</strong></p>
            <p><span className="text-muted-foreground">Method:</span> {paymentMethodLabel(payment.paymentMethod)}</p>
            {payment.transactionReference && (
              <p><span className="text-muted-foreground">Reference:</span> {payment.transactionReference}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reject-reason">Rejection Reason <span className="text-destructive">*</span></Label>
            <Textarea
              id="reject-reason"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Transaction reference not found in our records. Please resubmit with the correct reference."
              rows={3}
            />
            {reason.trim().length > 0 && reason.trim().length < 5 && (
              <p className="text-xs text-destructive">Reason must be at least 5 characters</p>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={handleReject}
            disabled={isPending || reason.trim().length < 5}
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
            Reject Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PendingApprovalsTab() {
  const { data, isLoading, refetch } = useAdminPendingPayments(50, 0);
  const { mutate: verify, isPending: verifying } = useAdminVerifyPayment();
  const [rejectTarget, setRejectTarget] = useState<AdminPayment | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const payments = data?.data ?? [];

  function handleApprove(p: AdminPayment) {
    setApprovingId(p.id);
    verify(
      { paymentId: p.id },
      {
        onSuccess: () => { toast.success("Payment approved", "Subscription is now active."); setApprovingId(null); },
        onError: () => { toast.error("Failed to approve payment"); setApprovingId(null); },
      }
    );
  }

  if (isLoading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground py-8"><Loader2 className="h-4 w-4 animate-spin" /> Loading pending approvals…</div>;
  }

  if (payments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/20">
          <CheckCircle2 className="h-7 w-7 text-emerald-600" />
        </div>
        <p className="font-semibold text-foreground">No pending approvals</p>
        <p className="text-sm text-muted-foreground">All payment submissions have been reviewed.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{data?.total} submission{data?.total !== 1 ? "s" : ""} awaiting review</p>
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      <div className="rounded-xl border border-[hsl(var(--border))] overflow-hidden">
        {/* Table header */}
        <div className="hidden sm:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-4 px-4 py-2.5 bg-muted/50 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          <span>Organisation</span>
          <span>Method</span>
          <span>Amount</span>
          <span>Submitted</span>
          <span>Reference</span>
          <span>Actions</span>
        </div>

        {payments.map((p) => (
          <div
            key={p.id}
            className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-3 sm:gap-4 px-4 py-3.5 border-b last:border-0 hover:bg-muted/20 transition-colors"
          >
            {/* Org name */}
            <div>
              <p className="font-semibold text-sm text-foreground">{p.orgName}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{p.currency} subscription payment</p>
            </div>

            {/* Method */}
            <div className="flex items-center">
              <Badge variant="slate" className="text-xs">{paymentMethodLabel(p.paymentMethod)}</Badge>
            </div>

            {/* Amount */}
            <div>
              <p className="text-sm font-semibold text-foreground">{p.currency} {p.amount.toLocaleString()}</p>
            </div>

            {/* Submitted date */}
            <div>
              <p className="text-xs text-muted-foreground">
                {p.submittedAt ? new Date(p.submittedAt).toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" }) : "—"}
              </p>
            </div>

            {/* Reference + proof */}
            <div className="space-y-0.5">
              <p className="text-xs font-mono text-foreground truncate max-w-[120px]">
                {p.transactionReference || "—"}
              </p>
              {p.proofFileKey && (
                <a
                  href={`/api/v1/uploads/${p.proofFileKey}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  <Eye className="h-3 w-3" /> View proof
                </a>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => handleApprove(p)}
                disabled={!!approvingId}
                className="h-8 gap-1.5"
              >
                {approvingId === p.id
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Check className="h-3.5 w-3.5" />}
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-destructive border-destructive/30 hover:bg-destructive/10 gap-1.5"
                onClick={() => setRejectTarget(p)}
                disabled={!!approvingId}
              >
                <X className="h-3.5 w-3.5" />
                Reject
              </Button>
            </div>
          </div>
        ))}
      </div>

      {rejectTarget && (
        <RejectModal payment={rejectTarget} onClose={() => setRejectTarget(null)} />
      )}
    </div>
  );
}

// ── All Subscriptions Tab ─────────────────────────────────────────────────────

function SubscriptionsTab() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [suspendTarget, setSuspendTarget] = useState<AdminSubscription | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const { mutate: suspend, isPending: suspending } = useAdminSuspendSubscription();
  const { mutate: extend, isPending: extending } = useAdminExtendSubscription();

  // Debounce search
  const handleSearch = (v: string) => {
    setSearch(v);
    clearTimeout((window as any)._searchTimer);
    (window as any)._searchTimer = setTimeout(() => setDebouncedSearch(v), 400);
  };

  const { data, isLoading } = useAdminSubscriptions({
    status: statusFilter === "all" ? undefined : statusFilter,
    search: debouncedSearch || undefined,
    limit: 50,
  });

  const subs = data?.data ?? [];

  function handleSuspend() {
    if (!suspendTarget || suspendReason.trim().length < 5) return;
    suspend(
      { subscriptionId: suspendTarget.id, reason: suspendReason.trim() },
      {
        onSuccess: () => { toast.success("Subscription suspended"); setSuspendTarget(null); setSuspendReason(""); },
        onError: () => toast.error("Failed to suspend subscription"),
      }
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input
            value={search}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Search organisations…"
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="trialing">Trialing</SelectItem>
            <SelectItem value="pending_payment">Pending Payment</SelectItem>
            <SelectItem value="pending_verification">Pending Verification</SelectItem>
            <SelectItem value="grace_period">Grace Period</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground self-center">{data?.total ?? 0} results</p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading subscriptions…
        </div>
      ) : subs.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">No subscriptions found.</div>
      ) : (
        <div className="rounded-xl border border-[hsl(var(--border))] overflow-hidden">
          <div className="hidden sm:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-4 px-4 py-2.5 bg-muted/50 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <span>Organisation</span>
            <span>Plan</span>
            <span>Status</span>
            <span>Cycle / Price</span>
            <span>Renews</span>
            <span>Actions</span>
          </div>

          {subs.map(sub => {
            const statusCfg = STATUS_BADGE[sub.status] ?? { variant: "outline" as const, label: sub.status };
            return (
              <div
                key={sub.id}
                className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-3 sm:gap-4 px-4 py-3.5 border-b last:border-0 hover:bg-muted/20 transition-colors"
              >
                <div>
                  <p className="font-semibold text-sm">{sub.orgName}</p>
                  <p className="text-xs text-muted-foreground">Created {new Date(sub.createdAt).toLocaleDateString("en-UG", { month: "short", year: "numeric" })}</p>
                </div>
                <div className="flex items-center">
                  <Badge variant="info">{sub.plan.name}</Badge>
                </div>
                <div className="flex items-center">
                  <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                </div>
                <div>
                  <p className="text-xs text-foreground capitalize">{sub.billingCycle}</p>
                  {sub.pricePaid && (
                    <p className="text-xs text-muted-foreground">
                      {sub.priceCurrency} {sub.pricePaid.toLocaleString()}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    {sub.currentPeriodEnd
                      ? new Date(sub.currentPeriodEnd).toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" })
                      : "—"}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {sub.status === "active" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs text-destructive border-destructive/30"
                      onClick={() => { setSuspendTarget(sub); setSuspendReason(""); }}
                    >
                      <Ban className="h-3 w-3 mr-1" /> Suspend
                    </Button>
                  )}
                  {(sub.status === "suspended" || sub.status === "expired" || sub.status === "grace_period") && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs text-emerald-700 border-emerald-300"
                      onClick={() => extend({ subscriptionId: sub.id, days: 30, reason: "Admin reactivation" })}
                      disabled={extending}
                    >
                      <RotateCcw className="h-3 w-3 mr-1" /> Extend 30d
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Suspend Modal */}
      {suspendTarget && (
        <Dialog open onOpenChange={() => { setSuspendTarget(null); setSuspendReason(""); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Ban className="h-4 w-4" /> Suspend Subscription
              </DialogTitle>
              <DialogDescription>
                {suspendTarget.orgName} will immediately lose access to paid features.
                You can reactivate it later.
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-3">
              <div className="space-y-1.5">
                <Label>Reason for suspension *</Label>
                <Textarea
                  value={suspendReason}
                  onChange={e => setSuspendReason(e.target.value)}
                  placeholder="e.g. Non-payment after grace period, compliance issue, etc."
                  rows={3}
                />
                {suspendReason.trim().length > 0 && suspendReason.trim().length < 5 && (
                  <p className="text-xs text-destructive">Reason must be at least 5 characters</p>
                )}
              </div>
            </DialogBody>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setSuspendTarget(null)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={handleSuspend}
                disabled={suspending || suspendReason.trim().length < 5}
              >
                {suspending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                Suspend
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ── Payment Methods form (existing) ───────────────────────────────────────────

function PaymentMethodsForm() {
  const { data: settings, isLoading } = useAdminBillingSettings();
  const { mutate: updateSettings, isPending: saving } = useAdminUpdateBillingSettings();
  const [form, setForm] = useState<Partial<BillingSettings>>({});

  // Seed form from loaded settings on first load
  useEffect(() => { if (settings) setForm(settings); }, [settings]);

  function set(key: keyof BillingSettings, val: string | number) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  function handleSave() {
    updateSettings(form as any, {
      onSuccess: () => toast.success("Saved", "Payment settings updated."),
      onError:   () => toast.error("Error", "Could not save settings."),
    });
  }

  if (isLoading) return <div className="flex items-center gap-2 text-sm text-muted-foreground py-6"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;

  // Merge settings into form on first load
  const merged = { ...settings, ...form };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Settings className="h-4 w-4 text-primary" /> Billing Rules</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          {[
            { key: "vatRatePercent" as const, label: "VAT Rate (%)", type: "number" },
            { key: "invoicePrefix"  as const, label: "Invoice Prefix",   type: "text", placeholder: "CR-INV" },
            { key: "trialDays"      as const, label: "Trial Period (days)", type: "number" },
            { key: "gracePeriodDays"as const, label: "Grace Period (days)", type: "number" },
          ].map(({ key, label, type, placeholder }) => (
            <div key={key} className="space-y-1.5">
              <Label>{label}</Label>
              <Input type={type} value={(merged as any)[key] ?? ""} onChange={e => set(key, type === "number" ? Number(e.target.value) : e.target.value)} placeholder={placeholder} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Landmark className="h-4 w-4 text-primary" /> Bank Transfer</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          {([
            ["bankName","Bank Name","Stanbic Bank Uganda"],
            ["bankAccountName","Account Name","Crib Properties Ltd"],
            ["bankAccountNumber","Account Number","9030005812395"],
            ["bankBranch","Branch","Garden City Branch"],
            ["bankSwiftCode","SWIFT / BIC","SBICUGKX"],
            ["bankSortCode","Sort Code",""],
          ] as const).map(([key, label, placeholder]) => (
            <div key={key} className="space-y-1.5">
              <Label>{label}</Label>
              <Input value={(merged as any)[key] ?? ""} onChange={e => set(key as keyof BillingSettings, e.target.value)} placeholder={placeholder} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Phone className="h-4 w-4 text-primary" /> Mobile Money</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          {([
            ["mtnNumber","MTN MoMo Number","+256 77 000 0000"],
            ["mtnName","MTN Account Name","Crib Properties"],
            ["airtelNumber","Airtel Number","+256 75 000 0000"],
            ["airtelName","Airtel Account Name","Crib Properties"],
          ] as const).map(([key, label, placeholder]) => (
            <div key={key} className="space-y-1.5">
              <Label>{label}</Label>
              <Input value={(merged as any)[key] ?? ""} onChange={e => set(key as keyof BillingSettings, e.target.value)} placeholder={placeholder} />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Save Payment Settings
        </Button>
      </div>
    </div>
  );
}

// ── Plans form (existing) ──────────────────────────────────────────────────────

const PLAN_FEATURES: { key: string; label: string }[] = [
  { key: "analytics_basic",       label: "Basic Analytics"        },
  { key: "analytics_advanced",    label: "Advanced Analytics"     },
  { key: "maintenance_workflows", label: "Maintenance Workflows"  },
  { key: "document_storage",      label: "Document Storage"       },
  { key: "tenant_messaging",      label: "Tenant Messaging"       },
  { key: "team_members",          label: "Team Members"           },
  { key: "custom_branding",       label: "Custom Branding"        },
  { key: "priority_support",      label: "Priority Support"       },
  { key: "dedicated_support",     label: "Dedicated Support"      },
  { key: "api_access",            label: "API Access"             },
  { key: "sso",                   label: "SSO / SAML"             },
  { key: "audit_logs",            label: "Audit Logs"             },
  { key: "manualPayments",        label: "Record Manual Payment"  },
];

function PlanCard({ plan }: { plan: SubscriptionPlan }) {
  const { mutate: updatePlan, isPending } = useAdminUpdatePlan();
  const [edits, setEdits] = useState<Record<string, string | number | boolean>>({});

  function setField(key: string, val: string | number | boolean) {
    setEdits(prev => ({ ...prev, [key]: val }));
  }

  function val(key: string) {
    return edits[key] !== undefined ? edits[key] : (plan as any)[key];
  }

  function featVal(key: string): boolean {
    if (edits[`feat_${key}`] !== undefined) return edits[`feat_${key}`] as boolean;
    return plan.features[key] ?? false;
  }

  const isDirty = Object.keys(edits).length > 0;

  function handleSave() {
    const updates: Record<string, unknown> = {};
    const featureUpdates: Record<string, boolean> = { ...plan.features };
    Object.entries(edits).forEach(([k, v]) => {
      if (k.startsWith("feat_")) featureUpdates[k.replace("feat_", "")] = v as boolean;
      else updates[k] = v;
    });
    updates.features = featureUpdates;
    updatePlan(
      { planId: plan.id, updates: updates as any },
      {
        onSuccess: () => { toast.success("Saved", `${plan.name} updated.`); setEdits({}); },
        onError:   () => toast.error("Error", "Could not save plan."),
      }
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{plan.name}</CardTitle>
            <CardDescription className="text-xs">{plan.slug}</CardDescription>
          </div>
          {isDirty && (
            <Button size="sm" onClick={handleSave} disabled={isPending}>
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Save
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Pricing</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { key: "monthlyPriceUgx",     label: "Monthly (UGX)"   },
              { key: "annualPriceUgx",      label: "Annual (UGX)"    },
              { key: "monthlyPriceUsdCents",label: "Monthly (USD ¢)" },
              { key: "annualPriceUsdCents", label: "Annual (USD ¢)"  },
            ].map(({ key, label }) => (
              <div key={key} className="space-y-1">
                <Label className="text-xs">{label}</Label>
                <Input type="number" className="h-8 text-sm" value={val(key)} onChange={e => setField(key, Number(e.target.value))} />
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Limits <span className="font-normal normal-case text-muted-foreground/60">(-1 = unlimited)</span></p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { key: "maxProperties", label: "Properties" },
              { key: "maxUnits",      label: "Units"       },
              { key: "maxUsers",      label: "Users"       },
              { key: "maxStorageMb",  label: "Storage (MB)"},
            ].map(({ key, label }) => (
              <div key={key} className="space-y-1">
                <Label className="text-xs">{label}</Label>
                <Input type="number" className="h-8 text-sm" value={val(key)} onChange={e => setField(key, Number(e.target.value))} />
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Features</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {PLAN_FEATURES.map(({ key, label }) => (
              <div key={key} className={cn(
                "flex items-center gap-3 rounded-[8px] border px-3 py-2 transition-colors",
                featVal(key) ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10" : "border-border bg-background"
              )}>
                <Switch
                  id={`${plan.id}-${key}`}
                  checked={featVal(key)}
                  onCheckedChange={v => setField(`feat_${key}`, v)}
                />
                <Label htmlFor={`${plan.id}-${key}`} className={cn(
                  "text-sm cursor-pointer",
                  featVal(key) ? "text-emerald-800 dark:text-emerald-300" : "text-foreground"
                )}>
                  {label}
                </Label>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PlansForm() {
  const { data: plans = [], isLoading } = useAdminPlans();
  if (isLoading) return <div className="flex items-center gap-2 text-sm text-muted-foreground py-8"><Loader2 className="h-4 w-4 animate-spin" /> Loading plans…</div>;
  return <div className="space-y-4">{plans.map(plan => <PlanCard key={plan.id} plan={plan} />)}</div>;
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AdminBillingPage() {
  const { data: stats } = useAdminAnalytics();
  const pendingCount = stats?.pendingVerifications ?? 0;

  return (
    <PermissionGate
      role="superadmin"
      fallback={
        <div className="flex items-center justify-center min-h-[300px] text-center">
          <p className="text-muted-foreground text-sm">Access restricted to platform administrators.</p>
        </div>
      }
    >
      <div className="space-y-6 max-w-6xl">
        <PageHeader
          title="Billing & Plans"
          description="Subscription analytics, payment approvals, plan management, and payment settings."
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href="/settings"><ArrowLeft className="h-3.5 w-3.5" /> Back</Link>
            </Button>
          }
        />

        <Tabs defaultValue={pendingCount > 0 ? "approvals" : "analytics"}>
          <TabsList className="flex-wrap h-auto gap-1 mb-6">
            <TabsTrigger value="analytics">
              <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="approvals" className="relative">
              <Clock className="h-3.5 w-3.5 mr-1.5" />
              Pending Approvals
              {pendingCount > 0 && (
                <span className="ml-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white px-1">
                  {pendingCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="subscriptions">
              <Users className="h-3.5 w-3.5 mr-1.5" />
              All Subscriptions
            </TabsTrigger>
            <TabsTrigger value="plans">
              <Zap className="h-3.5 w-3.5 mr-1.5" />
              Plans &amp; Features
            </TabsTrigger>
            <TabsTrigger value="payments">
              <Settings className="h-3.5 w-3.5 mr-1.5" />
              Payment Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="analytics">
            <AnalyticsTab />
          </TabsContent>
          <TabsContent value="approvals">
            <PendingApprovalsTab />
          </TabsContent>
          <TabsContent value="subscriptions">
            <SubscriptionsTab />
          </TabsContent>
          <TabsContent value="plans">
            <PlansForm />
          </TabsContent>
          <TabsContent value="payments">
            <PaymentMethodsForm />
          </TabsContent>
        </Tabs>
      </div>
    </PermissionGate>
  );
}
