"use client";

import { useState } from "react";
import {
  Home, CreditCard, FileText, Wrench, CheckCircle2, Clock,
  AlertCircle, ChevronRight, Plus, X, Loader2, Download,
  Smartphone, Building2, Banknote, CreditCard as CardIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/common/StatusBadge";
import { formatCurrency, formatDate } from "@/utils/formatters";
import { usePayments, useRecordPayment, useRentSchedule } from "@/hooks/usePayments";
import { useLeases, useSignLease } from "@/hooks/useLeases";
import { useMaintenanceIssues, useCreateMaintenanceIssue } from "@/hooks/useInspections";
import { useAppStore } from "@/store/useAppStore";
import { cn } from "@/utils/cn";
import { PaymentTimeline } from "@/components/payments/PaymentTimeline";
import { WalletBalanceCard } from "@/components/payments/WalletBalanceCard";
import type { Payment } from "@/types";

// ─── helpers ────────────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-semibold text-foreground mb-3">{children}</h2>;
}

// ─── Pay Rent Dialog ─────────────────────────────────────────────────────────

const PAYMENT_METHODS = [
  { id: "mtn_momo",    label: "MTN Mobile Money", icon: Smartphone, color: "text-yellow-600" },
  { id: "airtel_money",label: "Airtel Money",      icon: Smartphone, color: "text-red-500" },
  { id: "bank_transfer",label: "Bank Transfer",    icon: Building2,  color: "text-blue-600" },
  { id: "cash",        label: "Cash",              icon: Banknote,   color: "text-emerald-600" },
  { id: "card",        label: "Card",              icon: CardIcon,   color: "text-violet-600" },
];

interface PayDialogProps {
  lease: { id: string; tenantId: string; landlordId: string; propertyId: string; unitId: string; terms: { monthlyRent: number; currency: string } };
  onClose: () => void;
}

function PayDialog({ lease, onClose }: PayDialogProps) {
  const [method, setMethod] = useState<string | null>(null);
  const [ref, setRef] = useState("");
  const { mutate, isPending, isSuccess } = useRecordPayment();

  function handlePay() {
    if (!method) return;
    mutate({
      state: "initiated",
      category: "rent",
      method: method as Payment["method"],
      leaseId: lease.id,
      amount: lease.terms.monthlyRent,
      currency: lease.terms.currency,
      reference: ref || `PAY-${Date.now()}`,
      notes: ref ? `External ref: ${ref}` : undefined,
    } as Omit<Payment, "id" | "createdAt" | "updatedAt">);
  }

  if (isSuccess) {
    return (
      <div className="flex flex-col items-center gap-4 py-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/40">
          <CheckCircle2 className="h-7 w-7 text-emerald-600" />
        </div>
        <div className="text-center">
          <p className="font-semibold text-foreground">Payment submitted!</p>
          <p className="text-sm text-muted-foreground mt-1">Your payment is being processed.</p>
        </div>
        <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground">Pay Rent</h3>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="rounded-lg bg-muted/50 px-4 py-3 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Amount due</span>
        <span className="text-lg font-bold">{formatCurrency(lease.terms.monthlyRent, lease.terms.currency)}</span>
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Payment method</p>
        <div className="grid grid-cols-1 gap-2">
          {PAYMENT_METHODS.map((m) => (
            <button
              key={m.id}
              onClick={() => setMethod(m.id)}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all",
                method === m.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40 hover:bg-muted/40",
              )}
            >
              <m.icon className={cn("h-4 w-4", m.color)} />
              <span className="text-sm font-medium">{m.label}</span>
              {method === m.id && <CheckCircle2 className="h-3.5 w-3.5 text-primary ml-auto" />}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Transaction reference <span className="font-normal normal-case">(optional)</span>
        </Label>
        <Input
          type="text"
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="e.g. MTN transaction ID"
        />
      </div>

      <Button className="w-full" disabled={!method || isPending} onClick={handlePay}>
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
        {isPending ? "Submitting…" : "Submit Payment"}
      </Button>
    </div>
  );
}

// ─── Payment Detail Sheet ─────────────────────────────────────────────────────

function PaymentDetailSheet({ payment, onClose }: { payment: Payment; onClose: () => void }) {
  const rows: [string, string][] = [
    ["Reference", payment.reference ?? "—"],
    ["Category", payment.category],
    ["Method", payment.method ?? "—"],
    ["Amount", formatCurrency(payment.amount, payment.currency)],
    ["Paid at", payment.paidAt ? formatDate(payment.paidAt) : "—"],
    ["Status", payment.state],
    ["Notes", payment.notes ?? "—"],
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground">Payment Details</h3>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <dl className="divide-y divide-border">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between py-2 text-sm">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium font-mono text-foreground max-w-[55%] text-right break-all">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ─── Maintenance Request Dialog ──────────────────────────────────────────────

const MAINTENANCE_CATEGORIES = [
  "plumbing", "electrical", "hvac", "structural", "appliance", "pest_control", "cleaning", "security", "other",
];

const PRIORITIES = ["low", "medium", "high", "urgent"] as const;

interface MaintenanceDialogProps {
  userId: string;
  leaseId: string;
  propertyId: string;
  unitId: string;
  onClose: () => void;
}

function MaintenanceDialog({ userId, leaseId, propertyId, unitId, onClose }: MaintenanceDialogProps) {
  const [category, setCategory] = useState("plumbing");
  const [priority, setPriority] = useState<typeof PRIORITIES[number]>("medium");
  const [description, setDescription] = useState("");
  const { mutate, isPending, isSuccess } = useCreateMaintenanceIssue();

  function handleSubmit() {
    if (!description.trim()) return;
    mutate({
      category,
      priority,
      description,
      reportedBy: userId,
      leaseId,
      propertyId,
      unitId,
      title: `${category.replace(/_/g, " ")} issue`,
    } as any);
  }

  if (isSuccess) {
    return (
      <div className="flex flex-col items-center gap-4 py-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/40">
          <CheckCircle2 className="h-7 w-7 text-emerald-600" />
        </div>
        <div className="text-center">
          <p className="font-semibold text-foreground">Request submitted!</p>
          <p className="text-sm text-muted-foreground mt-1">Your landlord has been notified.</p>
        </div>
        <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground">New Maintenance Request</h3>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Category</Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MAINTENANCE_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Priority</p>
        <div className="grid grid-cols-4 gap-2">
          {PRIORITIES.map((p) => (
            <button
              key={p}
              onClick={() => setPriority(p)}
              className={cn(
                "rounded-md border py-1.5 text-xs font-medium capitalize transition-all",
                priority === p
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:border-primary/40",
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the issue in detail…"
          rows={4}
          className="resize-none"
        />
      </div>

      <Button className="w-full" disabled={!description.trim() || isPending} onClick={handleSubmit}>
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
        {isPending ? "Submitting…" : "Submit Request"}
      </Button>
    </div>
  );
}

// ─── Sign Lease Dialog ────────────────────────────────────────────────────────

interface SignLeaseDialogProps {
  leaseId: string;
  onClose: () => void;
}

function SignLeaseDialog({ leaseId, onClose }: SignLeaseDialogProps) {
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const { mutate, isPending, isSuccess } = useSignLease();

  function handleSign() {
    if (!name.trim() || !agreed) return;
    mutate({ id: leaseId, party: "tenant", signatureDataUrl: `typed:${name}` });
  }

  if (isSuccess) {
    return (
      <div className="flex flex-col items-center gap-4 py-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/40">
          <CheckCircle2 className="h-7 w-7 text-emerald-600" />
        </div>
        <div className="text-center">
          <p className="font-semibold text-foreground">Lease signed!</p>
          <p className="text-sm text-muted-foreground mt-1">Your signature has been recorded.</p>
        </div>
        <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground">Sign Lease Agreement</h3>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300">
        By signing, you confirm that you have read and agree to all terms and conditions of this lease agreement.
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Type your full name to sign
        </Label>
        <Input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your full legal name"
          className="font-medium"
        />
        {name && (
          <p className="mt-2 font-serif text-xl text-muted-foreground italic px-1">{name}</p>
        )}
      </div>

      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
        />
        <span className="text-sm text-muted-foreground leading-snug">
          I have read and agree to all terms and conditions in this lease agreement.
        </span>
      </label>

      <Button className="w-full" disabled={!name.trim() || !agreed || isPending} onClick={handleSign}>
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
        {isPending ? "Signing…" : "Sign Lease"}
      </Button>
    </div>
  );
}

// ─── Dialog wrapper ───────────────────────────────────────────────────────────

function DialogOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-md mx-4 sm:mx-auto bg-[hsl(var(--card))] rounded-t-2xl sm:rounded-2xl border border-border shadow-2xl p-5 max-h-[90vh] overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Dialog = "pay" | "maintenance" | "sign" | null;

export default function TenantPortalPage() {
  const [tab, setTab] = useState("overview");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);

  const user = useAppStore((s) => s.user);

  const { data: leasesData, isLoading: leasesLoading } = useLeases();
  const { data: paymentsData, isLoading: paymentsLoading } = usePayments();
  const { data: maintenanceData } = useMaintenanceIssues();

  // Resolve tenant's data
  const allLeases = leasesData?.data ?? [];
  const allPayments = paymentsData?.data ?? [];
  const allMaintenance = maintenanceData?.data ?? [];

  const userId = user?.id ?? "";

  // Filter to this tenant's data (by tenantId or reportedBy)
  const myLease = allLeases.find((l) => l.tenantId === userId) ?? allLeases[0];
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { data: schedulesData } = useRentSchedule(myLease?.id ?? "");
  const myPayments = allPayments.filter((p) => !myLease || p.leaseId === myLease.id);
  const hasOverdueRent = (schedulesData?.data ?? []).some((s) => s.state === "overdue");
  const myMaintenance = allMaintenance.filter((m) => (m as any).reportedBy === userId);
  const openRequests = myMaintenance.filter((m) => !["resolved", "closed"].includes(m.state));

  const nextPaymentDate = myLease?.terms
    ? (() => {
        const today = new Date();
        const next = new Date(today.getFullYear(), today.getMonth() + (today.getDate() > 1 ? 1 : 0), 1);
        return next.toLocaleDateString("en-UG", { month: "long", day: "numeric", year: "numeric" });
      })()
    : "—";

  const tenantSig = myLease?.signatures?.find((s: any) => s.party === "tenant");
  const landlordSig = myLease?.signatures?.find((s: any) => s.party === "landlord");
  const needsTenantSignature = tenantSig?.status !== "signed";

  function closeDialog() {
    setDialog(null);
    setSelectedPayment(null);
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-5">

        {/* Current Lease Banner */}
        {myLease && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Current Lease</p>
                  <p className="font-mono font-semibold">{myLease.reference}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {formatDate(myLease.terms.startDate)}
                    {myLease.terms.endDate ? ` — ${formatDate(myLease.terms.endDate)}` : " · Ongoing"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Monthly Rent</p>
                    <p className="text-xl font-bold">
                      {formatCurrency(myLease.terms.monthlyRent, myLease.terms.currency)}
                    </p>
                  </div>
                  <StatusBadge state={myLease.state} domain="lease" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {leasesLoading && !myLease && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading your tenancy…
          </div>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="overview" className="gap-1.5">
              <Home className="h-3.5 w-3.5" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="payments" className="gap-1.5">
              <CreditCard className="h-3.5 w-3.5" />
              Payments
              {hasOverdueRent && (
                <span className="ml-1 flex h-2 w-2 rounded-full bg-destructive" />
              )}
            </TabsTrigger>
            <TabsTrigger value="lease" className="gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              Lease
            </TabsTrigger>
            <TabsTrigger value="maintenance" className="gap-1.5">
              <Wrench className="h-3.5 w-3.5" />
              Maintenance
              {openRequests.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-4 min-w-4 px-1 text-[10px]">
                  {openRequests.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── Overview ────────────────────────────────────────────── */}
          <TabsContent value="overview" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                {
                  label: "Rent Status",
                  value: hasOverdueRent ? "Overdue" : "Up to date",
                  color: hasOverdueRent ? "text-destructive" : "text-emerald-600",
                  icon: hasOverdueRent ? AlertCircle : CheckCircle2,
                },
                { label: "Next Payment", value: nextPaymentDate, color: "text-foreground", icon: Clock },
                { label: "Open Requests", value: String(openRequests.length), color: "text-foreground", icon: Wrench },
              ].map((s) => (
                <Card key={s.label}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-2 mb-1">
                      <s.icon className={cn("h-4 w-4", s.color)} />
                      <p className="text-xs text-muted-foreground">{s.label}</p>
                    </div>
                    <p className={cn("text-lg font-bold", s.color)}>{s.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: "Pay Rent", icon: CreditCard, action: () => setDialog("pay"), color: "text-primary", disabled: !myLease },
                  { label: "Maintenance Request", icon: Wrench, action: () => setDialog("maintenance"), color: "text-amber-600", disabled: !myLease },
                  { label: "View Lease", icon: FileText, action: () => setTab("lease"), color: "text-violet-600", disabled: !myLease },
                ].map((a) => (
                  <button
                    key={a.label}
                    onClick={a.action}
                    disabled={a.disabled}
                    className="flex flex-col items-center gap-2 p-3 rounded-lg border border-border hover:bg-muted/50 hover:border-primary/30 transition-all text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <a.icon className={cn("h-5 w-5", a.color)} />
                    <span className="text-center leading-tight">{a.label}</span>
                  </button>
                ))}
              </CardContent>
            </Card>

            {/* Recent payment */}
            {myPayments.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Last Payment</CardTitle>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const last = myPayments[0];
                    return (
                      <button
                        className="w-full flex items-center justify-between py-1 text-sm hover:text-primary transition-colors"
                        onClick={() => { setSelectedPayment(last); }}
                      >
                        <div className="text-left">
                          <p className="font-mono font-medium">{last.reference}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(last.paidAt ?? last.createdAt)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge state={last.state} domain="payment" />
                          <span className="font-medium">{formatCurrency(last.amount, last.currency)}</span>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </button>
                    );
                  })()}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Payments ─────────────────────────────────────────────── */}
          <TabsContent value="payments" className="mt-4 space-y-4">
            {myLease && (
              <div className="flex items-center justify-between">
                <SectionHeading>Payment History</SectionHeading>
                <Button size="sm" onClick={() => setDialog("pay")}>
                  <CreditCard className="h-3.5 w-3.5" />
                  Pay Rent
                </Button>
              </div>
            )}

            {/* Wallet credit balance — only shows when balance > 0 */}
            {userId && <WalletBalanceCard tenantId={userId} />}

            {/* Payment timeline — expandable allocation details per entry */}
            <Card>
              <CardContent className="pt-4">
                <PaymentTimeline
                  leaseId={myLease?.id ?? ""}
                  payments={myPayments}
                  schedules={schedulesData?.data ?? []}
                  isLoading={paymentsLoading}
                />
                {!paymentsLoading && myPayments.length === 0 && myLease && (
                  <div className="flex justify-center mt-2">
                    <Button variant="outline" size="sm" onClick={() => setDialog("pay")}>
                      Make first payment
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Lease ────────────────────────────────────────────────── */}
          <TabsContent value="lease" className="mt-4 space-y-4">
            {!myLease ? (
              <Card>
                <CardContent className="pt-6 text-center py-12">
                  <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No lease found for your account.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">Lease Terms</CardTitle>
                      <StatusBadge state={myLease.state} domain="lease" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
                      {[
                        ["Reference", myLease.reference],
                        ["Type", myLease.type?.replace(/_/g, " ")],
                        ["Start date", formatDate(myLease.terms.startDate)],
                        ["End date", myLease.terms.endDate ? formatDate(myLease.terms.endDate) : "—"],
                        ["Monthly rent", formatCurrency(myLease.terms.monthlyRent, myLease.terms.currency)],
                        ["Security deposit", formatCurrency(myLease.terms.depositAmount, myLease.terms.currency)],
                        ["Notice period", `${myLease.terms.noticePeriodDays} days`],
                        ["Grace period", `${myLease.terms.gracePeriodDays} days`],
                      ].map(([label, value]) => (
                        <div key={label as string}>
                          <dt className="text-xs text-muted-foreground">{label}</dt>
                          <dd className="text-sm font-medium capitalize">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Signatures</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {[
                      { party: "Tenant", sig: tenantSig },
                      { party: "Landlord", sig: landlordSig },
                    ].map(({ party, sig }) => (
                      <div key={party} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                        <div>
                          <p className="text-sm font-medium">{party}</p>
                          {sig?.name && <p className="text-xs text-muted-foreground">{sig.name}</p>}
                        </div>
                        {sig?.status === "signed" ? (
                          <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Signed {sig.signedAt ? formatDate(sig.signedAt) : ""}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-xs text-amber-600">
                            <Clock className="h-3.5 w-3.5" />
                            Pending signature
                          </div>
                        )}
                      </div>
                    ))}

                    {needsTenantSignature && (
                      <Button className="w-full mt-2" onClick={() => setDialog("sign")}>
                        <FileText className="h-4 w-4" />
                        Sign Lease Agreement
                      </Button>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Lease Document</p>
                        <p className="text-xs text-muted-foreground">PDF format</p>
                      </div>
                      <Button variant="outline" size="sm">
                        <Download className="h-3.5 w-3.5" />
                        Download PDF
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* ── Maintenance ──────────────────────────────────────────── */}
          <TabsContent value="maintenance" className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <SectionHeading>Maintenance Requests</SectionHeading>
              <Button size="sm" disabled={!myLease} onClick={() => setDialog("maintenance")}>
                <Plus className="h-3.5 w-3.5" />
                New Request
              </Button>
            </div>

            <Card>
              <CardContent className="pt-4">
                {myMaintenance.length === 0 ? (
                  <div className="text-center py-8">
                    <Wrench className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No maintenance requests yet.</p>
                    {myLease && (
                      <Button variant="outline" size="sm" className="mt-3" onClick={() => setDialog("maintenance")}>
                        Submit a request
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-0 divide-y divide-border/50">
                    {myMaintenance.map((m) => (
                      <div key={m.id} className="py-3 flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-sm font-medium capitalize">
                            {(m as any).title ?? (m as any).category?.replace(/_/g, " ") ?? "Issue"}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                            {(m as any).description ?? ""}
                          </p>
                          <p className="text-[11px] text-muted-foreground/60 mt-1">
                            {formatDate(m.createdAt)}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <StatusBadge state={m.state} domain="maintenance" />
                          {(m as any).priority && (
                            <span className={cn(
                              "text-[10px] rounded-full px-1.5 py-0.5 font-medium capitalize",
                              (m as any).priority === "urgent" ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400" :
                              (m as any).priority === "high" ? "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400" :
                              "bg-muted text-muted-foreground",
                            )}>
                              {(m as any).priority}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Dialogs ───────────────────────────────────────────────── */}
      {dialog === "pay" && myLease && (
        <DialogOverlay onClose={closeDialog}>
          <PayDialog lease={myLease as any} onClose={closeDialog} />
        </DialogOverlay>
      )}

      {dialog === "maintenance" && myLease && (
        <DialogOverlay onClose={closeDialog}>
          <MaintenanceDialog
            userId={userId}
            leaseId={myLease.id}
            propertyId={myLease.propertyId}
            unitId={myLease.unitId}
            onClose={closeDialog}
          />
        </DialogOverlay>
      )}

      {dialog === "sign" && myLease && (
        <DialogOverlay onClose={closeDialog}>
          <SignLeaseDialog leaseId={myLease.id} onClose={closeDialog} />
        </DialogOverlay>
      )}

      {selectedPayment && (
        <DialogOverlay onClose={closeDialog}>
          <PaymentDetailSheet payment={selectedPayment} onClose={closeDialog} />
        </DialogOverlay>
      )}
    </div>
  );
}
