"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, Home, RotateCcw, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { RulesBuilder } from "@/components/properties/RulesBuilder";
import { useProperty, useUnits, useUpdatePropertyRules, useUpdateUnitRules } from "@/hooks/useProperties";
import { cn } from "@/utils/cn";
import type { PropertyRules, Unit } from "@/types";

interface Props {
  params: Promise<{ id: string }>;
}

// ── Unit selector sidebar ─────────────────────────────────────────────────────

const STATUS_DOT: Record<string, string> = {
  occupied:    "bg-teal-500",
  available:   "bg-emerald-500",
  reserved:    "bg-amber-500",
  maintenance: "bg-red-500",
};

function UnitSelector({
  units,
  selected,
  onSelect,
}: {
  units: Unit[];
  selected: string | "property";
  onSelect: (id: string | "property") => void;
}) {
  return (
    <div className="space-y-1">
      {/* Property defaults entry */}
      <button
        onClick={() => onSelect("property")}
        className={cn(
          "w-full flex items-center gap-2.5 rounded-[6px] px-3 py-2.5 text-sm transition-colors text-left",
          selected === "property"
            ? "bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-400 font-semibold"
            : "hover:bg-muted/50 text-muted-foreground",
        )}
      >
        <Building2 className="h-4 w-4 shrink-0" />
        <span>Property Defaults</span>
      </button>

      <Separator className="my-2" />

      <p className="text-xs font-medium text-muted-foreground px-3 pb-1 uppercase tracking-wide">
        Units
      </p>

      {units.map((unit) => {
        const hasOverride = !!unit.rules;
        return (
          <button
            key={unit.id}
            onClick={() => onSelect(unit.id)}
            className={cn(
              "w-full flex items-center gap-2.5 rounded-[6px] px-3 py-2.5 text-sm transition-colors text-left",
              selected === unit.id
                ? "bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-400 font-semibold"
                : "hover:bg-muted/50",
            )}
          >
            <Home className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate">{unit.name}</span>
                {hasOverride && (
                  <span className="text-xs text-amber-600 font-normal shrink-0">custom</span>
                )}
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", STATUS_DOT[unit.status] ?? "bg-muted")} />
                <span className="text-xs text-muted-foreground capitalize">{unit.status}</span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PropertyRulesPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();

  const { data: property, isLoading: loadingProp } = useProperty(id);
  const { data: unitsData, isLoading: loadingUnits } = useUnits(id);
  const units = unitsData?.data ?? [];

  const { mutate: savePropertyRules, isPending: savingProp } = useUpdatePropertyRules();
  const { mutate: saveUnitRules,     isPending: savingUnit } = useUpdateUnitRules();

  // Whether this property rents units individually (multi-unit)
  const isMultiUnit = (property?.totalUnits ?? 0) > 1;

  const [selected, setSelected] = useState<string | "property">("property");

  const loading = loadingProp || (isMultiUnit && loadingUnits);

  // Determine the rules to show in the builder
  const propertyRules = property?.rules;
  const selectedUnit  = selected !== "property" ? units.find((u) => u.id === selected) : undefined;
  // Unit uses its own rules if set; otherwise fall back to property defaults
  const activeRules   = selectedUnit?.rules ?? propertyRules;
  const usingDefaults = !!selectedUnit && !selectedUnit.rules;

  function handleSave(rules: PropertyRules) {
    if (selected === "property") {
      savePropertyRules({ id, rules });
    } else {
      saveUnitRules({ propertyId: id, unitId: selected, rules });
    }
  }

  function handleResetUnit() {
    if (selected !== "property") {
      saveUnitRules({ propertyId: id, unitId: selected, rules: null });
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Header ────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">
            {isMultiUnit ? "Unit Rules" : "Property Rules"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isMultiUnit
              ? `${property?.name} — configure rules per unit or set property-wide defaults`
              : `Configure rent, fees, and policies for ${property?.name ?? "this property"}`}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : !propertyRules ? null : isMultiUnit ? (
        /* ── Multi-unit layout: sidebar picker + builder ── */
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6 items-start">
          {/* Sidebar */}
          <div className="rounded-[6px] border p-2">
            <UnitSelector
              units={units}
              selected={selected}
              onSelect={setSelected}
            />
          </div>

          {/* Builder */}
          <div className="space-y-4">
            {/* Context banner */}
            {selected === "property" ? (
              <div className="flex items-start gap-2 rounded-[6px] border border-teal-200 bg-teal-50 dark:border-teal-800 dark:bg-teal-950/30 px-4 py-3 text-sm text-teal-800 dark:text-teal-200">
                <Info className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  These are the <strong>property-wide defaults</strong>. Any unit without its own
                  custom rules will inherit these settings.
                </span>
              </div>
            ) : usingDefaults ? (
              <div className="flex items-center justify-between gap-3 rounded-[6px] border border-muted px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Info className="h-4 w-4 shrink-0" />
                  <span>
                    <strong>{selectedUnit?.name}</strong> is using the property defaults.
                    Edit below to create custom rules for this unit.
                  </span>
                </div>
                <Badge variant="secondary" className="shrink-0 text-xs">Inherited</Badge>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-[6px] border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
                  <Info className="h-4 w-4 shrink-0" />
                  <span>
                    <strong>{selectedUnit?.name}</strong> has custom rules that override the property defaults.
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 text-xs gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-100"
                  onClick={handleResetUnit}
                  loading={savingUnit}
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset to defaults
                </Button>
              </div>
            )}

            <RulesBuilder
              key={selected} // remount when switching so form resets
              propertyId={id}
              initialRules={activeRules!}
              onSave={handleSave}
              isSaving={selected === "property" ? savingProp : savingUnit}
            />
          </div>
        </div>
      ) : (
        /* ── Single / whole-property layout ───────────────── */
        <RulesBuilder
          propertyId={id}
          initialRules={propertyRules}
        />
      )}
    </div>
  );
}
