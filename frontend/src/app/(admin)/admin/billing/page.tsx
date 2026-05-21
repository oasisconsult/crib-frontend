"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Save, Loader2, Building2, Smartphone, CreditCard,
  Settings, ArrowLeft, Check, X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/common/PageHeader";
import { PermissionGate } from "@/components/common/PermissionGate";
import {
  useAdminBillingSettings, useAdminUpdateBillingSettings,
  useAdminPlans, useAdminUpdatePlan,
} from "@/hooks/useSubscription";
import { toast } from "@/store/useUIStore";
import type { BillingSettings, SubscriptionPlan } from "@/services/api/subscriptions";

// ── Feature definitions ────────────────────────────────────────────────────

const PLAN_FEATURES: { key: string; label: string; description: string }[] = [
  { key: "analytics_basic",       label: "Basic Analytics",        description: "Occupancy and revenue overview" },
  { key: "analytics_advanced",    label: "Advanced Analytics",     description: "Trend charts, cashflow analysis" },
  { key: "maintenance_workflows", label: "Maintenance Workflows",  description: "Log, assign, and track maintenance jobs" },
  { key: "document_storage",      label: "Document Storage",       description: "Store lease agreements and ID copies" },
  { key: "tenant_messaging",      label: "Tenant Messaging",       description: "In-app messaging between manager and tenants" },
  { key: "team_members",          label: "Team Members",           description: "Add managers and maintenance staff" },
  { key: "custom_branding",       label: "Custom Branding",        description: "Upload your agency logo and colours" },
  { key: "priority_support",      label: "Priority Support",       description: "Faster response SLA on support tickets" },
  { key: "dedicated_support",     label: "Dedicated Support",      description: "Named support contact and onboarding call" },
  { key: "api_access",            label: "API Access",             description: "REST API for custom integrations" },
  { key: "sso",                   label: "SSO / SAML",             description: "Single sign-on for enterprise teams" },
  { key: "audit_logs",            label: "Audit Logs",             description: "Immutable log of all admin actions" },
];

// ── Payment methods form ───────────────────────────────────────────────────

function PaymentMethodsForm() {
  const { data: settings, isLoading } = useAdminBillingSettings();
  const { mutate: updateSettings, isPending: saving } = useAdminUpdateBillingSettings();
  const [form, setForm] = useState<Partial<BillingSettings>>({});

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

  if (isLoading) return (
    <div className="flex items-center gap-2 text-muted-foreground text-sm py-8">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading…
    </div>
  );

  return (
    <div className="space-y-6">
      {/* General billing rules */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="h-4 w-4 text-primary" /> Billing Rules
          </CardTitle>
          <CardDescription>VAT rate and invoice settings applied to all subscription invoices.</CardDescription>
        </CardHeader>
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
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" /> Bank Transfer
          </CardTitle>
          <CardDescription>Shown to customers who choose bank transfer payment.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          {[
            { key: "bankName" as const,          label: "Bank Name",       placeholder: "Stanbic Bank Uganda" },
            { key: "bankAccountName" as const,   label: "Account Name",    placeholder: "Crib Properties Ltd" },
            { key: "bankAccountNumber" as const, label: "Account Number",  placeholder: "9030005812395" },
            { key: "bankBranch" as const,        label: "Branch",          placeholder: "Garden City Branch" },
            { key: "bankSwiftCode" as const,     label: "SWIFT / BIC",     placeholder: "SBICUGKX" },
            { key: "bankSortCode" as const,      label: "Sort Code",       placeholder: "Optional" },
          ].map(({ key, label, placeholder }) => (
            <div key={key} className="space-y-1.5">
              <Label>{label}</Label>
              <Input value={form[key] ?? ""} onChange={e => set(key, e.target.value)} placeholder={placeholder} />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Mobile Money */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-primary" /> Mobile Money
          </CardTitle>
          <CardDescription>MTN MoMo and Airtel Money details shown to customers.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          {[
            { key: "mtnNumber" as const,   label: "MTN MoMo Number",   placeholder: "+256 77 000 0000" },
            { key: "mtnName" as const,     label: "MTN Account Name",  placeholder: "Crib Properties" },
            { key: "airtelNumber" as const,label: "Airtel Number",     placeholder: "+256 75 000 0000" },
            { key: "airtelName" as const,  label: "Airtel Account Name",placeholder: "Crib Properties" },
          ].map(({ key, label, placeholder }) => (
            <div key={key} className="space-y-1.5">
              <Label>{label}</Label>
              <Input value={form[key] ?? ""} onChange={e => set(key, e.target.value)} placeholder={placeholder} />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Cash */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" /> Cash Payment Instructions
          </CardTitle>
          <CardDescription>Text shown to customers who choose to pay in person.</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={form.cashInstructions ?? ""}
            onChange={e => set("cashInstructions", e.target.value)}
            rows={4}
            placeholder="e.g. Visit our offices at Plot 12, Kampala Road between 9am–5pm, Mon–Fri. Ask for the Finance team."
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Payment Settings
        </Button>
      </div>
    </div>
  );
}

// ── Plan card (pricing + limits + feature flags) ───────────────────────────

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

  function setFeat(key: string, v: boolean) {
    setEdits(prev => ({ ...prev, [`feat_${key}`]: v }));
  }

  const isDirty = Object.keys(edits).length > 0;

  function handleSave() {
    // Separate feat_ keys from pricing/limits keys
    const updates: Record<string, unknown> = {};
    const featureUpdates: Record<string, boolean> = { ...plan.features };

    Object.entries(edits).forEach(([k, v]) => {
      if (k.startsWith("feat_")) {
        featureUpdates[k.replace("feat_", "")] = v as boolean;
      } else {
        updates[k] = v;
      }
    });
    updates.features = featureUpdates;

    updatePlan(
      { planId: plan.id, updates: updates as any },
      {
        onSuccess: () => {
          toast.success("Saved", `${plan.name} updated.`);
          setEdits({});
        },
        onError: () => toast.error("Error", "Could not save plan."),
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{plan.name}</CardTitle>
            <CardDescription className="text-xs">{plan.slug} · display order: {plan.displayOrder}</CardDescription>
          </div>
          {isDirty && (
            <Button size="sm" onClick={handleSave} disabled={isPending}>
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* Pricing */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Pricing</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { key: "monthlyPriceUgx",      label: "Monthly (UGX)"     },
              { key: "annualPriceUgx",       label: "Annual (UGX)"      },
              { key: "monthlyPriceUsdCents", label: "Monthly (USD ¢)"   },
              { key: "annualPriceUsdCents",  label: "Annual (USD ¢)"    },
            ].map(({ key, label }) => (
              <div key={key} className="space-y-1">
                <Label className="text-xs">{label}</Label>
                <Input type="number" className="h-8 text-sm" value={val(key)} onChange={e => setField(key, Number(e.target.value))} />
              </div>
            ))}
          </div>
        </div>

        {/* Limits */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Usage Limits <span className="font-normal normal-case text-muted-foreground/60">(-1 = unlimited)</span></p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { key: "maxProperties", label: "Properties" },
              { key: "maxUnits",      label: "Units"       },
              { key: "maxUsers",      label: "Users"       },
              { key: "maxStorageMb",  label: "Storage (MB)" },
            ].map(({ key, label }) => (
              <div key={key} className="space-y-1">
                <Label className="text-xs">{label}</Label>
                <Input type="number" className="h-8 text-sm" value={val(key)} onChange={e => setField(key, Number(e.target.value))} />
              </div>
            ))}
          </div>
        </div>

        {/* Feature flags */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Features</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {PLAN_FEATURES.map(({ key, label, description }) => (
              <div
                key={key}
                className={`flex items-start gap-3 rounded-[8px] border px-3 py-2.5 transition-colors ${
                  featVal(key)
                    ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10"
                    : "border-border bg-background"
                }`}
              >
                <Switch
                  id={`${plan.id}-${key}`}
                  checked={featVal(key)}
                  onCheckedChange={(v) => setFeat(key, v)}
                  className="mt-0.5"
                />
                <div className="min-w-0">
                  <Label
                    htmlFor={`${plan.id}-${key}`}
                    className={`text-sm font-medium cursor-pointer leading-tight ${
                      featVal(key) ? "text-emerald-800 dark:text-emerald-300" : "text-foreground"
                    }`}
                  >
                    {label}
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{description}</p>
                </div>
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
  if (isLoading) return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading plans…
    </div>
  );
  return (
    <div className="space-y-4">
      {plans.map(plan => <PlanCard key={plan.id} plan={plan} />)}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function AdminBillingPage() {
  return (
    <PermissionGate
      role="superadmin"
      fallback={
        <div className="flex items-center justify-center min-h-[300px] text-center">
          <p className="text-muted-foreground text-sm">Access restricted to platform administrators.</p>
        </div>
      }
    >
      <div className="space-y-6 max-w-5xl">
        <PageHeader
          title="Billing & Plans"
          description="Configure subscription plans, pricing, feature access, and payment methods."
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href="/settings"><ArrowLeft className="h-3.5 w-3.5" /> Back</Link>
            </Button>
          }
        />

        <Tabs defaultValue="plans">
          <TabsList className="mb-6">
            <TabsTrigger value="plans">Plans &amp; Features</TabsTrigger>
            <TabsTrigger value="payments">Payment Methods</TabsTrigger>
          </TabsList>
          <TabsContent value="plans"><PlansForm /></TabsContent>
          <TabsContent value="payments"><PaymentMethodsForm /></TabsContent>
        </Tabs>
      </div>
    </PermissionGate>
  );
}
