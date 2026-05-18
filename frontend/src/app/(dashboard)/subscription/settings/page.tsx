"use client";

import { useEffect, useState } from "react";
import { Save, Loader2, Settings, CreditCard, Building2, Smartphone } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/common/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useAdminBillingSettings, useAdminUpdateBillingSettings,
  useAdminPlans, useAdminUpdatePlan,
} from "@/hooks/useSubscription";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "@/store/useUIStore";
import type { BillingSettings } from "@/services/api/subscriptions";

// ── Billing settings form ──────────────────────────────────────────────────

function BillingSettingsForm() {
  const { data: settings, isLoading } = useAdminBillingSettings();
  const { mutate: updateSettings, isPending: saving } = useAdminUpdateBillingSettings();
  const [form, setForm] = useState<Partial<BillingSettings>>({});

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  function set(key: keyof BillingSettings, val: string | number) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  function handleSave() {
    updateSettings(form as any, {
      onSuccess: () => toast.success("Saved", "Billing settings updated."),
      onError: () => toast.error("Error", "Could not save settings."),
    });
  }

  if (isLoading) return <div className="flex items-center gap-2 text-muted-foreground text-sm py-6"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;

  return (
    <div className="space-y-6">
      {/* General */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Settings className="h-4 w-4 text-primary" /> General</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>VAT Rate (%)</Label>
            <Input type="number" value={form.vatRatePercent ?? ""} onChange={e => set("vatRatePercent", Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label>Invoice Prefix</Label>
            <Input value={form.invoicePrefix ?? ""} onChange={e => set("invoicePrefix", e.target.value)} placeholder="CR-INV" />
          </div>
          <div className="space-y-1.5">
            <Label>Trial Period (days)</Label>
            <Input type="number" value={form.trialDays ?? ""} onChange={e => set("trialDays", Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label>Grace Period (days)</Label>
            <Input type="number" value={form.gracePeriodDays ?? ""} onChange={e => set("gracePeriodDays", Number(e.target.value))} />
          </div>
        </CardContent>
      </Card>

      {/* Bank Transfer */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /> Bank Transfer Details</CardTitle>
          <CardDescription>Displayed to customers when they select Bank Transfer.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Bank Name</Label>
            <Input value={form.bankName ?? ""} onChange={e => set("bankName", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Account Name</Label>
            <Input value={form.bankAccountName ?? ""} onChange={e => set("bankAccountName", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Account Number</Label>
            <Input value={form.bankAccountNumber ?? ""} onChange={e => set("bankAccountNumber", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Branch</Label>
            <Input value={form.bankBranch ?? ""} onChange={e => set("bankBranch", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>SWIFT / BIC Code</Label>
            <Input value={form.bankSwiftCode ?? ""} onChange={e => set("bankSwiftCode", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Sort Code</Label>
            <Input value={form.bankSortCode ?? ""} onChange={e => set("bankSortCode", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Mobile Money */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Smartphone className="h-4 w-4 text-primary" /> Mobile Money Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>MTN MoMo Number</Label>
            <Input value={form.mtnNumber ?? ""} onChange={e => set("mtnNumber", e.target.value)} placeholder="+256 77 000 0000" />
          </div>
          <div className="space-y-1.5">
            <Label>MTN Account Name</Label>
            <Input value={form.mtnName ?? ""} onChange={e => set("mtnName", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Airtel Money Number</Label>
            <Input value={form.airtelNumber ?? ""} onChange={e => set("airtelNumber", e.target.value)} placeholder="+256 75 000 0000" />
          </div>
          <div className="space-y-1.5">
            <Label>Airtel Account Name</Label>
            <Input value={form.airtelName ?? ""} onChange={e => set("airtelName", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Cash */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><CreditCard className="h-4 w-4 text-primary" /> Cash Payment Instructions</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={form.cashInstructions ?? ""}
            onChange={e => set("cashInstructions", e.target.value)}
            rows={3}
            placeholder="Instructions shown to users who choose cash payment…"
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Settings
        </Button>
      </div>
    </div>
  );
}

// ── Plan pricing form ──────────────────────────────────────────────────────

function PlanPricingForm() {
  const { data: plans = [], isLoading } = useAdminPlans();
  const { mutate: updatePlan, isPending } = useAdminUpdatePlan();
  const [editing, setEditing] = useState<Record<string, Record<string, string | number>>>({});

  function setField(planId: string, key: string, val: string | number) {
    setEditing(prev => ({ ...prev, [planId]: { ...(prev[planId] ?? {}), [key]: val } }));
  }

  function handleSavePlan(planId: string) {
    const updates = editing[planId];
    if (!updates) return;
    updatePlan({ planId, updates }, {
      onSuccess: () => toast.success("Saved", "Plan updated."),
      onError: () => toast.error("Error", "Could not save plan."),
    });
  }

  if (isLoading) return <div className="flex items-center gap-2 text-sm text-muted-foreground py-6"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;

  return (
    <div className="space-y-4">
      {plans.map(plan => {
        const edits = editing[plan.id] ?? {};
        const val = (key: keyof typeof plan) => (edits[key] !== undefined ? edits[key] : plan[key]) as string | number;
        const isDirty = !!Object.keys(edits).length;

        return (
          <Card key={plan.id}>
            <CardHeader>
              <CardTitle className="text-base">{plan.name}</CardTitle>
              <CardDescription>{plan.slug} — display order: {plan.displayOrder}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Monthly (UGX)</Label>
                  <Input type="number" value={val("monthlyPriceUgx")} onChange={e => setField(plan.id, "monthlyPriceUgx", Number(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Annual (UGX)</Label>
                  <Input type="number" value={val("annualPriceUgx")} onChange={e => setField(plan.id, "annualPriceUgx", Number(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Monthly (USD cents)</Label>
                  <Input type="number" value={val("monthlyPriceUsdCents")} onChange={e => setField(plan.id, "monthlyPriceUsdCents", Number(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Annual (USD cents)</Label>
                  <Input type="number" value={val("annualPriceUsdCents")} onChange={e => setField(plan.id, "annualPriceUsdCents", Number(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Max Properties (-1=∞)</Label>
                  <Input type="number" value={val("maxProperties")} onChange={e => setField(plan.id, "maxProperties", Number(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Max Units (-1=∞)</Label>
                  <Input type="number" value={val("maxUnits")} onChange={e => setField(plan.id, "maxUnits", Number(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Max Users (-1=∞)</Label>
                  <Input type="number" value={val("maxUsers")} onChange={e => setField(plan.id, "maxUsers", Number(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Max Storage MB (-1=∞)</Label>
                  <Input type="number" value={val("maxStorageMb")} onChange={e => setField(plan.id, "maxStorageMb", Number(e.target.value))} />
                </div>
              </div>
              {isDirty && (
                <div className="flex justify-end">
                  <Button size="sm" onClick={() => handleSavePlan(plan.id)} disabled={isPending}>
                    {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Save {plan.name}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function BillingSettingsPage() {
  const { isSuperAdmin } = usePermissions();

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] text-center gap-3">
        <p className="text-muted-foreground text-sm">Access restricted to platform administrators.</p>
        <Button asChild variant="outline"><Link href="/subscription">Back</Link></Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Billing Settings"
        description="Configure plans, prices, payment instructions, and billing rules."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/subscription">Back to Subscription</Link>
          </Button>
        }
      />

      <Tabs defaultValue="settings">
        <TabsList className="mb-6">
          <TabsTrigger value="settings">Payment Settings</TabsTrigger>
          <TabsTrigger value="plans">Plan Pricing & Limits</TabsTrigger>
        </TabsList>
        <TabsContent value="settings"><BillingSettingsForm /></TabsContent>
        <TabsContent value="plans"><PlanPricingForm /></TabsContent>
      </Tabs>
    </div>
  );
}
