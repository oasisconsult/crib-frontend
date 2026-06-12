"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Home,
  User,
  Banknote,
  CalendarDays,
  ToggleLeft,
  ToggleRight,
  Info,
  BedDouble,
  Bath,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateLease } from "@/hooks/useLeases";
import { useTenants } from "@/hooks/useTenants";
import { useProperties, useUnits } from "@/hooks/useProperties";
import { formatCurrency } from "@/utils/formatters";
import { cn } from "@/utils/cn";
import type { LeaseType } from "@/types";

// ── Constants ──────────────────────────────────────────────────────────────────

const LEASE_TYPES: { value: LeaseType; label: string; description: string }[] = [
  {
    value: "fixed_term",
    label: "Fixed Term",
    description: "Set start and end date — lease ends automatically",
  },
  {
    value: "periodic",
    label: "Rolling / Periodic",
    description: "No fixed end date — continues until notice is given",
  },
  {
    value: "short_let",
    label: "Short Let",
    description: "Short-term rental, typically days to weeks",
  },
];

const CURRENCIES = ["UGX", "USD", "EUR", "GBP"];
const LATE_FEE_TYPES = [
  { value: "flat",       label: "Flat fee (UGX)"  },
  { value: "percentage", label: "Percentage (%)"  },
];

// ── Unit preview chip ──────────────────────────────────────────────────────────

function UnitPreview({
  unit,
  propertyName,
}: {
  unit: { name: string; type: string; monthlyRent: number; currency: string; bedrooms: number; bathrooms: number; floor?: number };
  propertyName: string;
}) {
  return (
    <div className="rounded-[6px] border border-primary/15 bg-primary/5 px-4 py-3 flex flex-wrap items-center gap-4 text-sm">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Home className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium text-foreground">{unit.name}</span>
        <span>·</span>
        <span>{propertyName}</span>
        {unit.floor !== undefined && <><span>·</span><span>Floor {unit.floor}</span></>}
      </div>
      <div className="flex items-center gap-3 ml-auto">
        <span className="flex items-center gap-1 text-muted-foreground">
          <BedDouble className="h-3.5 w-3.5" /> {unit.bedrooms}
        </span>
        <span className="flex items-center gap-1 text-muted-foreground">
          <Bath className="h-3.5 w-3.5" /> {unit.bathrooms}
        </span>
        <Badge variant="secondary" className="capitalize">{unit.type}</Badge>
        <span className="font-semibold text-emerald-600">
          {formatCurrency(unit.monthlyRent, unit.currency)}/mo
        </span>
      </div>
    </div>
  );
}

// ── Tenant preview chip ────────────────────────────────────────────────────────

function TenantPreview({ tenant }: { tenant: { firstName: string; lastName: string; email: string; phone?: string } }) {
  const initials = `${tenant.firstName[0]}${tenant.lastName[0]}`.toUpperCase();
  return (
    <div className="rounded-[6px] border bg-muted/30 px-4 py-3 flex items-center gap-3 text-sm">
      <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
        {initials}
      </div>
      <div>
        <p className="font-medium">{tenant.firstName} {tenant.lastName}</p>
        <p className="text-xs text-muted-foreground">{tenant.email}{tenant.phone ? ` · ${tenant.phone}` : ""}</p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function NewLeasePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mutate: createLease, isPending } = useCreateLease();

  // Pre-fill from URL params (?propertyId=&unitId=)
  const prePropertyId = searchParams.get("propertyId") ?? "";
  const preUnitId     = searchParams.get("unitId")     ?? "";

  // ── Section 1: Property & Unit ─────────────────────────────────────────────
  const [propertyId, setPropertyId] = useState(prePropertyId);
  const [unitId,     setUnitId]     = useState(preUnitId);

  const { data: propertiesData } = useProperties();
  const allProperties = propertiesData?.data ?? [];

  // Only offer active properties (they may have vacant units)
  const selectableProperties = allProperties.filter((p) => p.status === "active");

  // Load units for selected property
  const { data: unitsData, isLoading: loadingUnits } = useUnits(propertyId);
  const allUnits = unitsData?.data ?? [];

  // Only available units can receive a new lease
  const availableUnits = allUnits.filter((u) => u.status === "available");

  const selectedProperty = selectableProperties.find((p) => p.id === propertyId);
  const selectedUnit     = availableUnits.find((u) => u.id === unitId);
  const isWholeProperty  = selectedProperty?.isSingleUnit === true;

  // Auto-select the virtual unit for whole-property (single-unit) leases
  useEffect(() => {
    if (isWholeProperty && availableUnits.length > 0 && !unitId) {
      setUnitId(availableUnits[0].id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWholeProperty, availableUnits]);

  // When a unit is selected auto-fill rent and recalculate deposit from rules
  useEffect(() => {
    if (selectedUnit) {
      setMonthlyRent(selectedUnit.monthlyRent);
      setCurrency(selectedUnit.currency ?? "UGX");
      // Deposit = depositMonths × monthly rent (from property rules, default 1)
      const depositMths = selectedProperty?.rules?.depositMonths ?? 1;
      setDepositAmount(depositMths * selectedUnit.monthlyRent);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUnit]);

  // When a property is selected auto-fill all rule-driven fields
  useEffect(() => {
    if (selectedProperty?.rules) {
      const r = selectedProperty.rules;
      setNoticePeriodDays(r.noticePeriodDays);
      setGracePeriodDays(r.gracePeriodDays);
      setLateFeeType(r.lateFeeType);
      setLateFeeValue(r.lateFeeValue);
      setPaymentDueDay(r.rentDayOfMonth);
      setAdvanceMonths(r.advanceRentMonths ?? 1);
      // Deposit will be recalculated when unit (and its rent) is selected
      setDepositAmount(0);
    }
    // Reset unit when switching property
    setUnitId("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  // ── Section 2: Tenant ─────────────────────────────────────────────────────
  const [tenantId, setTenantId] = useState("");
  const { data: tenantsData } = useTenants();
  const tenants = tenantsData?.data ?? [];
  const selectedTenant = tenants.find((t) => t.id === tenantId);

  // ── Section 3: Lease type & dates ─────────────────────────────────────────
  const [leaseType,    setLeaseType]    = useState<LeaseType>("fixed_term");
  const [startDate,    setStartDate]    = useState("");
  const [endDate,      setEndDate]      = useState("");
  const isRolling = leaseType === "periodic";

  // ── Section 4: Financial terms ────────────────────────────────────────────
  const [monthlyRent,     setMonthlyRent]     = useState(0);
  const [depositAmount,   setDepositAmount]   = useState(0);
  const [advanceMonths,   setAdvanceMonths]   = useState(1);
  const [currency,        setCurrency]        = useState("UGX");
  const [paymentDueDay,   setPaymentDueDay]   = useState(1);
  const [noticePeriodDays, setNoticePeriodDays] = useState(30);
  const [gracePeriodDays,  setGracePeriodDays]  = useState(5);
  const [lateFeeType,     setLateFeeType]     = useState<"flat" | "percentage">("flat");
  const [lateFeeValue,    setLateFeeValue]    = useState(50000);

  // ── Date validation ────────────────────────────────────────────────────────
  const today = new Date().toISOString().split("T")[0];

  const endDateError: string | null = (() => {
    if (isRolling || !startDate || !endDate) return null;
    if (endDate <= startDate) return "End date must be after start date";
    return null;
  })();

  const startDateWarning: string | null = (() => {
    if (!startDate) return null;
    if (startDate < today) return "Start date is in the past — the lease will be marked active from this date";
    return null;
  })();

  // ── Validation ─────────────────────────────────────────────────────────────
  const canSubmit =
    !!propertyId &&
    !!unitId &&
    !!tenantId &&
    !!startDate &&
    (isRolling || !!endDate) &&
    !endDateError &&
    monthlyRent > 0;

  // ── Submit ─────────────────────────────────────────────────────────────────
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    createLease(
      {
        type: leaseType,
        landlordId: "landlord-1",
        tenantId,
        propertyId,
        unitId,
        reference: `LSE-${Date.now().toString(36).toUpperCase()}`,
        advanceMonths,
        terms: {
          startDate,
          endDate: isRolling ? undefined : endDate,
          monthlyRent,
          depositAmount,
          currency,
          paymentDueDay,
          noticePeriodDays,
          gracePeriodDays,
          lateFeeType,
          lateFeeValue,
        },
        clauses: [],
        signatures: [],
      },
      {
        onSuccess: (lease) => router.push(`/leases/${lease.id}`),
      },
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Lease</h1>
          <p className="text-sm text-muted-foreground">Create a lease agreement for a vacant unit</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* ── 1. Property & Unit ─────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Property & Unit
            </CardTitle>
            <CardDescription>Select the property, then choose from its available units</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Property */}
            <div className="space-y-1.5">
              <Label htmlFor="property">Property <span className="text-destructive">*</span></Label>
              <Select value={propertyId} onValueChange={setPropertyId}>
                <SelectTrigger id="property">
                  <SelectValue placeholder="Select a property..." />
                </SelectTrigger>
                <SelectContent>
                  {selectableProperties.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">No active properties found</div>
                  )}
                  {selectableProperties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="font-medium">{p.name}</span>
                      <span className="text-muted-foreground ml-1.5 text-xs">— {p.address.city}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Unit — hidden for whole-property leases; shown for multi-unit */}
            {isWholeProperty ? (
              propertyId && !loadingUnits && (
                availableUnits.length > 0 ? (
                  <div className="rounded-[6px] border border-primary/15 bg-primary/5 px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
                    <Home className="h-3.5 w-3.5 shrink-0 text-primary" />
                    Rented as whole — the entire property is leased as one unit.
                  </div>
                ) : (
                  <div className="rounded-[6px] border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 px-3 py-2 text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2">
                    <Info className="h-3.5 w-3.5 shrink-0" />
                    This property is currently occupied and cannot be leased again until the active lease ends.
                  </div>
                )
              )
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="unit">
                  Unit {availableUnits.length > 0 && <span className="text-destructive">*</span>}
                  {propertyId && !loadingUnits && (
                    <span className="ml-2 text-xs text-muted-foreground font-normal">
                      {availableUnits.length} available
                    </span>
                  )}
                </Label>
                {propertyId && !loadingUnits && availableUnits.length === 0 ? (
                  <div className="rounded-[6px] border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 px-3 py-2 text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2">
                    <Info className="h-3.5 w-3.5 shrink-0" />
                    No available units in this property. All units are currently occupied or under maintenance.
                  </div>
                ) : (
                  <Select
                    value={unitId}
                    onValueChange={setUnitId}
                    disabled={!propertyId || loadingUnits}
                  >
                    <SelectTrigger id="unit">
                      <SelectValue placeholder={
                        !propertyId
                          ? "Select a property first"
                          : loadingUnits
                            ? "Loading units..."
                            : "Select a unit..."
                      } />
                    </SelectTrigger>
                    <SelectContent>
                      {availableUnits.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{u.name}</span>
                            <span className="text-muted-foreground text-xs capitalize">{u.type}</span>
                            {u.floor !== undefined && (
                              <span className="text-muted-foreground text-xs">· Fl {u.floor}</span>
                            )}
                            <span className="text-emerald-600 text-xs ml-auto">
                              {formatCurrency(u.monthlyRent, u.currency)}/mo
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {/* Unit preview card */}
            {selectedUnit && selectedProperty && (
              <UnitPreview unit={selectedUnit} propertyName={selectedProperty.name} />
            )}
          </CardContent>
        </Card>

        {/* ── 2. Tenant ──────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" />
              Tenant
            </CardTitle>
            <CardDescription>The person entering into this lease agreement</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="tenant">Tenant <span className="text-destructive">*</span></Label>
              <Select value={tenantId} onValueChange={setTenantId}>
                <SelectTrigger id="tenant">
                  <SelectValue placeholder="Select a tenant..." />
                </SelectTrigger>
                <SelectContent>
                  {tenants.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">No tenants found</div>
                  )}
                  {tenants.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="font-medium">{t.firstName} {t.lastName}</span>
                      <span className="text-muted-foreground ml-1.5 text-xs">— {t.email}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedTenant && <TenantPreview tenant={selectedTenant} />}
          </CardContent>
        </Card>

        {/* ── 3. Lease type & dates ──────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              Lease Type & Duration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Lease type cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {LEASE_TYPES.map((lt) => (
                <button
                  key={lt.value}
                  type="button"
                  onClick={() => setLeaseType(lt.value)}
                  className={cn(
                    "rounded-[6px] border p-3 text-left transition-colors",
                    leaseType === lt.value
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:border-primary/40 hover:bg-muted/30",
                  )}
                >
                  <p className="text-sm font-medium">{lt.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{lt.description}</p>
                </button>
              ))}
            </div>

            <Separator />

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="startDate">
                  Start Date <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
                {startDateWarning && (
                  <p className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
                    <Info className="h-3 w-3 shrink-0" />
                    {startDateWarning}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="endDate" className={cn(isRolling && "text-muted-foreground")}>
                    End Date
                    {!isRolling && <span className="text-destructive"> *</span>}
                  </Label>
                  {isRolling && (
                    <span className="text-xs text-muted-foreground italic">optional for rolling</span>
                  )}
                </div>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  disabled={isRolling && !endDate}
                  min={startDate || today}
                  required={!isRolling}
                  error={!!endDateError}
                />
                {endDateError ? (
                  <p className="text-xs text-destructive flex items-center gap-1 mt-0.5">
                    <Info className="h-3 w-3 shrink-0" />
                    {endDateError}
                  </p>
                ) : isRolling && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Info className="h-3 w-3 shrink-0" />
                    Rolling lease — no end date needed unless you want to set one
                  </p>
                )}
              </div>
            </div>

            {/* Payment due day */}
            <div className="space-y-1.5">
              <Label htmlFor="dueDay">Rent Due Day of Month</Label>
              <Select
                value={String(paymentDueDay)}
                onValueChange={(v) => setPaymentDueDay(parseInt(v))}
              >
                <SelectTrigger id="dueDay" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 5, 7, 10, 14, 15, 20, 25, 28].map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {d === 1 ? "1st (default)" : `${d}${d === 2 ? "nd" : d === 3 ? "rd" : "th"}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* ── 4. Financial terms ─────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Banknote className="h-4 w-4" />
              Financial Terms
            </CardTitle>
            {selectedUnit && (
              <CardDescription>
                Pre-filled from unit and property rules — adjust if needed
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="monthlyRent">
                  Monthly Rent <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="monthlyRent"
                  type="number"
                  min={0}
                  value={monthlyRent || ""}
                  onChange={(e) => setMonthlyRent(parseInt(e.target.value) || 0)}
                  placeholder="0"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="depositAmount">Security Deposit</Label>
                <Input
                  id="depositAmount"
                  type="number"
                  min={0}
                  value={depositAmount || ""}
                  onChange={(e) => setDepositAmount(parseInt(e.target.value) || 0)}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="advanceMonths">
                Advance Rent Months
              </Label>
              <div className="flex items-center gap-3">
                <Select
                  value={String(advanceMonths)}
                  onValueChange={(v) => setAdvanceMonths(parseInt(v))}
                >
                  <SelectTrigger id="advanceMonths" className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1,2,3,4,5,6].map((m) => (
                      <SelectItem key={m} value={String(m)}>
                        {m} month{m !== 1 ? "s" : ""} in advance
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {monthlyRent > 0 && (
                  <span className="text-sm text-muted-foreground">
                    = {formatCurrency(monthlyRent * advanceMonths, currency)} due at signing
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Rent paid upfront at lease signing, before occupancy begins
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="currency">Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="currency" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Late fee */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                Late Fee Policy
                {selectedProperty && (
                  <span className="ml-1.5 font-normal normal-case text-muted-foreground/70">
                    (from property rules)
                  </span>
                )}
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="lateFeeType">Fee Type</Label>
                  <Select value={lateFeeType} onValueChange={(v) => setLateFeeType(v as "flat" | "percentage")}>
                    <SelectTrigger id="lateFeeType"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LATE_FEE_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lateFeeValue">
                    {lateFeeType === "percentage" ? "Percentage (%)" : "Amount (UGX)"}
                  </Label>
                  <Input
                    id="lateFeeValue"
                    type="number"
                    min={0}
                    value={lateFeeValue || ""}
                    onChange={(e) => setLateFeeValue(parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Notice & grace periods */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                Policy Periods
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="noticePeriod">Notice Period (days)</Label>
                  <Input
                    id="noticePeriod"
                    type="number"
                    min={0}
                    value={noticePeriodDays}
                    onChange={(e) => setNoticePeriodDays(parseInt(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="gracePeriod">Grace Period (days)</Label>
                  <Input
                    id="gracePeriod"
                    type="number"
                    min={0}
                    value={gracePeriodDays}
                    onChange={(e) => setGracePeriodDays(parseInt(e.target.value) || 0)}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Summary preview ─────────────────────────────── */}
        {canSubmit && (
          <div className="rounded-[6px] border border-primary/15 bg-primary/5 px-5 py-4 space-y-2 text-sm">
            <p className="font-semibold text-sm mb-3">Lease Summary</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
              <div className="flex justify-between text-muted-foreground">
                <span>Property</span>
                <span className="text-foreground font-medium truncate max-w-[140px]">{selectedProperty?.name}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Unit</span>
                <span className="text-foreground font-medium">{selectedUnit?.name}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Tenant</span>
                <span className="text-foreground font-medium truncate max-w-[140px]">
                  {selectedTenant?.firstName} {selectedTenant?.lastName}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Type</span>
                <span className="text-foreground font-medium capitalize">{leaseType.replace("_", " ")}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Start</span>
                <span className="text-foreground font-medium">{startDate}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>End</span>
                <span className="text-foreground font-medium">{isRolling && !endDate ? "Rolling" : endDate}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Monthly Rent</span>
                <span className="text-emerald-600 font-semibold">{formatCurrency(monthlyRent, currency)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Deposit</span>
                <span className="text-foreground font-medium">{formatCurrency(depositAmount, currency)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Advance Rent</span>
                <span className="text-foreground font-medium">{advanceMonths} month{advanceMonths !== 1 ? "s" : ""} ({formatCurrency(monthlyRent * advanceMonths, currency)})</span>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between gap-3 pt-1">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={isPending}
            disabled={!canSubmit}
          >
            Create Lease
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}
