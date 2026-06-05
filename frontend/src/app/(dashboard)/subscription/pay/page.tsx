"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Smartphone, Building2, Banknote, Upload, CheckCircle2,
  ArrowLeft, ArrowRight, Loader2, AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/common/PageHeader";
import { FileUpload } from "@/components/common/FileUpload";
import {
  usePlans, useCurrentSubscription, useBillingSettings, useSubmitPayment,
} from "@/hooks/useSubscription";
import { toast } from "@/store/useUIStore";
import { cn } from "@/utils/cn";
import type { BillingCycle, BillingCurrency, PaymentMethod, SubscriptionPlan } from "@/services/api/subscriptions";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatAmount(amount: number, currency: string) {
  if (currency === "UGX") return `UGX ${amount.toLocaleString()}`;
  return `$${(amount / 100).toFixed(2)}`;
}

function computeAmount(plan: SubscriptionPlan, cycle: BillingCycle, currency: BillingCurrency): number {
  if (currency === "UGX") {
    return cycle === "annual" ? plan.annualPriceUgx : plan.monthlyPriceUgx;
  }
  return cycle === "annual" ? plan.annualPriceUsdCents : plan.monthlyPriceUsdCents;
}

// ── Step indicator ─────────────────────────────────────────────────────────

function Steps({ current }: { current: number }) {
  const steps = ["Select Method", "Enter Details", "Confirm"];
  return (
    <div className="flex items-center gap-2 mb-8">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-2 flex-1 last:flex-none">
          <div className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all",
            // Done — light green tint, matches WorkflowStepper pattern
            i < current && "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
            // Active — light teal tint with brand border (not solid fill)
            i === current && "bg-[hsl(var(--accent))] text-[hsl(var(--primary))] border-2 border-[hsl(var(--primary))] ring-4 ring-[hsl(var(--primary))]/15",
            // Upcoming — outlined only, no dark fill
            i > current && "border-2 border-border bg-background dark:bg-card text-foreground/50",
          )}>
            {i < current ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
          </div>
          <span className={cn("text-sm hidden sm:block", i === current ? "font-semibold text-foreground" : "text-muted-foreground")}>{s}</span>
          {i < steps.length - 1 && <div className={cn("flex-1 h-px", i < current ? "bg-primary" : "bg-border")} />}
        </div>
      ))}
    </div>
  );
}

// ── Payment method cards ───────────────────────────────────────────────────

const METHODS: { id: PaymentMethod; label: string; icon: React.ElementType; desc: string }[] = [
  { id: "mtn_momo",      label: "MTN Mobile Money",  icon: Smartphone,  desc: "Pay with your MTN MoMo account" },
  { id: "airtel_money",  label: "Airtel Money",       icon: Smartphone,  desc: "Pay with your Airtel Money account" },
  { id: "bank_transfer", label: "Bank Transfer",      icon: Building2,   desc: "Direct bank transfer" },
  { id: "cash",          label: "Cash Payment",       icon: Banknote,    desc: "Pay in person at our office" },
];

// ── Main component ─────────────────────────────────────────────────────────

function PayPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const planId = params.get("planId") ?? "";
  const cycle = (params.get("cycle") ?? "monthly") as BillingCycle;
  const currency = (params.get("currency") ?? "UGX") as BillingCurrency;

  const { data: plans = [] } = usePlans();
  const { data: billingSettings } = useBillingSettings();
  const { mutate: submitPayment, isPending } = useSubmitPayment();

  const plan = plans.find(p => p.id === planId);
  const amount = plan ? computeAmount(plan, cycle, currency) : 0;

  const [step, setStep] = useState(0);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [form, setForm] = useState({
    phoneNumber: "", accountName: "", transactionReference: "",
    bankName: "", transferDate: "", notes: "", proofFileKey: "",
  });

  function set(key: string, val: string) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  function handleSubmit() {
    if (!method || !plan) return;
    submitPayment(
      {
        planId: plan.id,
        billingCycle: cycle,
        currency,
        paymentMethod: method,
        amount,
        phoneNumber: form.phoneNumber || undefined,
        accountName: form.accountName || undefined,
        transactionReference: form.transactionReference || undefined,
        bankName: form.bankName || undefined,
        transferDate: form.transferDate || undefined,
        notes: form.notes || undefined,
        proofFileKey: form.proofFileKey || undefined,
      },
      {
        onSuccess: () => {
          setStep(2);
        },
        onError: (err: any) =>
          toast.error("Submission failed", err?.response?.data?.detail ?? "Please try again"),
      },
    );
  }

  if (!plan) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] text-center gap-4">
        <AlertCircle className="h-8 w-8 text-muted-foreground" />
        <p className="text-muted-foreground">No plan selected. Please go back and choose a plan.</p>
        <Button asChild variant="outline"><a href="/subscription/plans"><ArrowLeft className="h-4 w-4" /> Back to Plans</a></Button>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center gap-6 max-w-sm mx-auto">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 border border-emerald-200">
          <CheckCircle2 className="h-8 w-8 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground mb-2">Payment Submitted!</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your payment has been received and is pending verification. We'll review it within 24 hours and notify you by email.
          </p>
        </div>
        <div className="flex gap-3">
          <Button asChild variant="outline">
            <a href="/subscription/billing">View History</a>
          </Button>
          <Button asChild>
            <a href="/subscription">Back to Subscription</a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      <PageHeader
        title="Make Payment"
        description={`${plan.name} plan — ${cycle === "annual" ? "Annual" : "Monthly"} billing`}
        actions={
          <Button asChild variant="ghost" size="sm">
            <a href="/subscription/plans"><ArrowLeft className="h-3.5 w-3.5" /> Back</a>
          </Button>
        }
      />

      <Steps current={step} />

      {/* Amount summary */}
      <div className="rounded-[var(--radius-lg)] border border-[hsl(var(--primary))]/20 bg-[hsl(var(--accent))] px-4 py-3 flex items-center justify-between mb-6">
        <div>
          <p className="text-sm font-semibold text-foreground">{plan.name} — {cycle === "annual" ? "Annual" : "Monthly"}</p>
          <p className="text-xs text-muted-foreground">18% VAT included</p>
        </div>
        <p className="text-xl font-bold text-foreground">{formatAmount(amount, currency)}</p>
      </div>

      {/* Step 0 — Select method */}
      {step === 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground mb-3">Select payment method</p>
          {METHODS.map(m => (
            <button
              key={m.id}
              onClick={() => setMethod(m.id)}
              className={cn(
                "w-full flex items-center gap-3 rounded-[var(--radius-lg)] border p-4 text-left transition-all",
                method === m.id ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border bg-card hover:border-primary/30",
              )}
            >
              <div className={cn("flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)]", method === m.id ? "bg-primary/10 text-primary" : "bg-[hsl(var(--accent))] text-[hsl(var(--primary))]")}>
                <m.icon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">{m.label}</p>
                <p className="text-xs text-muted-foreground">{m.desc}</p>
              </div>
              {method === m.id && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
            </button>
          ))}
          <Button className="w-full mt-4" disabled={!method} onClick={() => setStep(1)}>
            Continue <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Step 1 — Payment details */}
      {step === 1 && method && (
        <div className="space-y-5">
          {/* Instructions */}
          <div className="rounded-[var(--radius-lg)] border border-[hsl(var(--primary))]/20 bg-[hsl(var(--accent))] p-4 text-sm space-y-2">
            <p className="font-semibold text-foreground">Payment Instructions</p>
            {(method === "mtn_momo") && billingSettings && (
              <div className="space-y-1 text-muted-foreground">
                <p>Send {formatAmount(amount, currency)} to:</p>
                <p className="font-medium text-foreground">MTN: {billingSettings.mtnNumber}</p>
                <p className="font-medium text-foreground">Name: {billingSettings.mtnName}</p>
              </div>
            )}
            {(method === "airtel_money") && billingSettings && (
              <div className="space-y-1 text-muted-foreground">
                <p>Send {formatAmount(amount, currency)} to:</p>
                <p className="font-medium text-foreground">Airtel: {billingSettings.airtelNumber}</p>
                <p className="font-medium text-foreground">Name: {billingSettings.airtelName}</p>
              </div>
            )}
            {method === "bank_transfer" && billingSettings && (
              <div className="space-y-1 text-muted-foreground">
                <p>Transfer {formatAmount(amount, currency)} to:</p>
                <p className="font-medium text-foreground">Bank: {billingSettings.bankName}</p>
                <p className="font-medium text-foreground">Account: {billingSettings.bankAccountNumber}</p>
                <p className="font-medium text-foreground">Name: {billingSettings.bankAccountName}</p>
                <p className="font-medium text-foreground">Branch: {billingSettings.bankBranch}</p>
                {billingSettings.bankSwiftCode && <p className="font-medium text-foreground">SWIFT: {billingSettings.bankSwiftCode}</p>}
              </div>
            )}
            {method === "cash" && billingSettings && (
              <p className="text-muted-foreground">{billingSettings.cashInstructions}</p>
            )}
          </div>

          {/* Form fields */}
          <div className="space-y-4">
            {(method === "mtn_momo" || method === "airtel_money") && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone Number Used</Label>
                  <Input id="phone" placeholder="+256 7XX XXX XXX" value={form.phoneNumber} onChange={e => set("phoneNumber", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="acctname">Account Name</Label>
                  <Input id="acctname" placeholder="Name on account" value={form.accountName} onChange={e => set("accountName", e.target.value)} />
                </div>
              </>
            )}
            {method === "bank_transfer" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="bankname">Bank Name</Label>
                  <Input id="bankname" placeholder="e.g. Stanbic Bank" value={form.bankName} onChange={e => set("bankName", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="transferdate">Transfer Date</Label>
                  <Input id="transferdate" type="date" value={form.transferDate} onChange={e => set("transferDate", e.target.value)} />
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="ref">Transaction Reference <span className="text-muted-foreground">(required)</span></Label>
              <Input id="ref" placeholder="e.g. MTN1234567890" value={form.transactionReference} onChange={e => set("transactionReference", e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Upload className="h-3.5 w-3.5" />
                Upload Proof of Payment
                {form.proofFileKey && <span className="text-xs text-emerald-600 font-normal ml-1">✓ Uploaded</span>}
              </Label>
              <FileUpload
                category="document"
                maxFiles={1}
                onUpload={(results) => {
                  if (results[0]?.key) set("proofFileKey", results[0].key);
                }}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Input id="notes" placeholder="Any additional information..." value={form.notes} onChange={e => set("notes", e.target.value)} />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => setStep(0)} className="flex-1">
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isPending || !form.transactionReference}
              className="flex-1"
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Submit Payment
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PayPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
      <PayPageContent />
    </Suspense>
  );
}
