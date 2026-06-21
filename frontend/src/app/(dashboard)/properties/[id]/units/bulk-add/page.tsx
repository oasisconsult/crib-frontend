"use client";

import { use, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Layers, Eye, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useProperty, useUnits, useBulkCreateUnits } from "@/hooks/useProperties";
import { toast } from "@/store/useUIStore";
import type { UnitType, FurnishedStatus, WaterSource } from "@/types";

// ── Constants ──────────────────────────────────────────────────────────────────

const UNIT_TYPES: { value: UnitType; label: string }[] = [
  { value: "bedsitter",     label: "Bedsitter"   },
  { value: "studio",        label: "Studio"      },
  { value: "one_bed",       label: "1-Bedroom"   },
  { value: "two_bed",       label: "2-Bedroom"   },
  { value: "three_bed",     label: "3-Bedroom"   },
  { value: "four_bed_plus", label: "4-Bedroom+"  },
];

const BATHROOM_TYPE_OPTIONS = [
  { value: "self_contained", label: "Self-contained (private bathroom)" },
  { value: "semi_shared",    label: "Semi-shared (own toilet, shared shower)" },
  { value: "communal",       label: "Communal (all shared)" },
];

const WATER_SOURCE_OPTIONS = [
  { value: "inherit",   label: "Inherit from property" },
  { value: "municipal", label: "NWSC / Municipal"       },
  { value: "borehole",  label: "Borehole"               },
  { value: "tank",      label: "Water Tank"             },
  { value: "multiple",  label: "Multiple Sources"       },
];

const FURNISHED_OPTIONS: { value: FurnishedStatus; label: string }[] = [
  { value: "unfurnished",    label: "Unfurnished"    },
  { value: "semi_furnished", label: "Semi-furnished" },
  { value: "furnished",      label: "Furnished"      },
];

// ── Name generation ───────────────────────────────────────────────────────────

/**
 * Derives the block letter prefix from the block name.
 * "Block A" → "A", "North Wing" → "N", "B" → "B"
 */
function blockPrefix(blockName: string): string {
  const trimmed = blockName.trim();
  if (!trimmed) return "U";
  // If it looks like "Block X" or "Wing X", use the last word's first char
  const parts = trimmed.split(/\s+/);
  return (parts[parts.length - 1][0] ?? trimmed[0]).toUpperCase();
}

/**
 * Generates unit names for a floor range.
 * Format: {blockLetter}{floor}{unitOnFloor} where floor is 1 digit (-1=B)
 * and unitOnFloor is zero-padded to 2 digits.
 * e.g. block="Block A", floor=1, 10 units/floor → A101, A102 … A110
 * Basement (floor=-1): prefix "B" replaces the floor digit: AB01 … AB10
 */
function generateNames(
  blockName: string,
  floorFrom: number,
  floorTo: number,
  unitsPerFloor: number,
  startOffset: number, // how many units already exist (append mode)
): Array<{ name: string; floor: number }> {
  const prefix = blockPrefix(blockName);
  const result: Array<{ name: string; floor: number }> = [];

  // For append mode on the first floor we continue numbering from startOffset
  for (let f = floorFrom; f <= floorTo; f++) {
    const floorLabel = f < 0 ? `B${Math.abs(f)}` : String(f);
    const count = f === floorFrom ? unitsPerFloor - (startOffset % unitsPerFloor) : unitsPerFloor;
    const unitStart = f === floorFrom ? (startOffset % unitsPerFloor) + 1 : 1;

    for (let u = 0; u < count; u++) {
      const unitNum = String(unitStart + u).padStart(2, "0");
      result.push({ name: `${prefix}${floorLabel}${unitNum}`, floor: f });
    }
  }
  return result;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props { params: Promise<{ id: string }> }

type Step = "configure" | "template" | "preview";

export default function BulkAddUnitsPage({ params }: Props) {
  const { id: propertyId } = use(params);
  const router = useRouter();
  const { data: property } = useProperty(propertyId);
  const { data: existingUnitsData } = useUnits(propertyId, { pageSize: 500 });
  const { mutate: bulkCreate, isPending } = useBulkCreateUnits();

  const [step, setStep] = useState<Step>("configure");

  // Step 1 — configure
  const [block,        setBlock]        = useState("Block A");
  const [floorFrom,    setFloorFrom]    = useState("-1");
  const [floorTo,      setFloorTo]      = useState("10");
  const [unitsPerFloor,setUnitsPerFloor]= useState("10");

  // Step 2 — template settings applied to all generated units
  const [type,         setType]         = useState<UnitType>("bedsitter");
  const [monthlyRent,  setMonthlyRent]  = useState("");
  const [maxOccupants, setMaxOccupants] = useState("1");
  const [bathroomType, setBathroomType] = useState("self_contained");
  const [furnishedStatus, setFurnishedStatus] = useState<FurnishedStatus>("unfurnished");
  const [waterSource,  setWaterSource]  = useState<WaterSource | "inherit">("inherit");
  const [hasKitchen,   setHasKitchen]   = useState(true);

  // Derive next start offset from existing units in the same block on the first floor
  const startOffset = useMemo(() => {
    if (!existingUnitsData?.data) return 0;
    const units = existingUnitsData.data as any[];
    const prefix = blockPrefix(block);
    const floorNum = parseInt(floorFrom);
    const floorLabel = floorNum < 0 ? `B${Math.abs(floorNum)}` : String(floorNum);
    const pattern = `${prefix}${floorLabel}`;
    return units.filter((u) => u.name?.startsWith(pattern)).length;
  }, [existingUnitsData, block, floorFrom]);

  // Preview list
  const preview = useMemo(() => {
    const from = parseInt(floorFrom);
    const to   = parseInt(floorTo);
    const uPF  = parseInt(unitsPerFloor);
    if (isNaN(from) || isNaN(to) || isNaN(uPF) || uPF < 1 || to < from || !block.trim()) return [];
    return generateNames(block, from, to, uPF, startOffset);
  }, [block, floorFrom, floorTo, unitsPerFloor, startOffset]);

  // Group preview by floor for display
  const byFloor = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const { name, floor } of preview) {
      if (!map.has(floor)) map.set(floor, []);
      map.get(floor)!.push(name);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [preview]);

  const canConfigure =
    !!block.trim() &&
    !isNaN(parseInt(floorFrom)) &&
    !isNaN(parseInt(floorTo)) &&
    parseInt(floorTo) >= parseInt(floorFrom) &&
    parseInt(unitsPerFloor) >= 1 &&
    preview.length > 0;

  const canTemplate = !!monthlyRent && parseFloat(monthlyRent) > 0;

  function handleGenerate() {
    if (!canTemplate || preview.length === 0) return;

    const units = preview.map(({ name, floor }) => ({
      name,
      type,
      floor,
      monthlyRent:         parseFloat(monthlyRent),
      currency:            property?.currency ?? "UGX",
      block:               block.trim(),
      maxOccupants:        parseInt(maxOccupants) || 1,
      bathroomType,
      isSelfContained:     bathroomType === "self_contained",
      hasKitchen,
      hasStore:            false,
      hasDomesticQuarters: false,
      furnishedStatus,
      waterSource:         waterSource === "inherit" ? undefined : waterSource,
      bedrooms:            0,
      bathrooms:           bathroomType === "self_contained" ? 1 : 0,
      sittingRooms:        0,
      toilets:             bathroomType !== "communal" ? 1 : 0,
      parkingSpaces:       0,
      amenities:           [],
      images:              [],
    }));

    bulkCreate(
      { propertyId, units: units as any },
      {
        onSuccess: (created: any) => {
          toast.success(
            "Units added",
            `${created.length} units added to ${property?.name ?? "the property"}`,
          );
          router.push(`/properties/${propertyId}/units`);
        },
        onError: (err: any) => {
          toast.error("Failed to add units", err?.response?.data?.detail ?? "Please try again");
        },
      },
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bulk Add Units</h1>
          <p className="text-sm text-muted-foreground">
            {property?.name ? `Generate units for ${property.name}` : "Generate multiple units at once"}
          </p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm">
        {(["configure", "template", "preview"] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <div className="h-px w-6 bg-border" />}
            <button
              type="button"
              onClick={() => {
                if (s === "template" && !canConfigure) return;
                if (s === "preview" && (!canConfigure || !canTemplate)) return;
                setStep(s);
              }}
              className={`capitalize font-medium ${step === s ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {i + 1}. {s}
            </button>
          </div>
        ))}
      </div>

      {/* Step 1: Configure layout */}
      {step === "configure" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Block &amp; Floor Layout
            </CardTitle>
            <CardDescription>
              Define the physical structure. Units will be named automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="block">Block / Wing Name</Label>
              <Input
                id="block"
                value={block}
                onChange={(e) => setBlock(e.target.value)}
                placeholder="e.g. Block A, Block B, North Wing"
                autoFocus
              />
              {block.trim() && (
                <p className="text-xs text-muted-foreground">
                  Unit name prefix: <span className="font-mono font-medium">{blockPrefix(block)}</span>
                  {" "}(e.g. <span className="font-mono">{blockPrefix(block)}101</span>, <span className="font-mono">{blockPrefix(block)}102</span>)
                </p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="floorFrom">Floor from <span className="text-muted-foreground text-xs">(-1 = basement)</span></Label>
                <Input
                  id="floorFrom"
                  type="number"
                  min="-20"
                  max="200"
                  value={floorFrom}
                  onChange={(e) => setFloorFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="floorTo">Floor to</Label>
                <Input
                  id="floorTo"
                  type="number"
                  min="-20"
                  max="200"
                  value={floorTo}
                  onChange={(e) => setFloorTo(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="unitsPerFloor">Units per floor</Label>
                <Input
                  id="unitsPerFloor"
                  type="number"
                  min="1"
                  max="100"
                  value={unitsPerFloor}
                  onChange={(e) => setUnitsPerFloor(e.target.value)}
                />
              </div>
            </div>

            {startOffset > 0 && (
              <div className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                {startOffset} unit{startOffset !== 1 ? "s" : ""} already exist in {block} on floor {floorFrom} — new units will continue from where they left off.
              </div>
            )}

            {preview.length > 0 && (
              <div className="rounded-md bg-muted/50 border px-3 py-2 text-sm">
                <span className="font-medium">{preview.length} units</span> will be created across{" "}
                {byFloor.length} floor{byFloor.length !== 1 ? "s" : ""}: floors{" "}
                {floorFrom} to {floorTo}
              </div>
            )}

            <div className="flex justify-end pt-1">
              <Button onClick={() => setStep("template")} disabled={!canConfigure}>
                Next: Unit Settings
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Template settings */}
      {step === "template" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Unit Settings</CardTitle>
            <CardDescription>
              These settings apply to all {preview.length} units. You can edit individual units after creation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Unit Type</Label>
                <Select value={type} onValueChange={(v) => setType(v as UnitType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNIT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rent">Monthly Rent ({property?.currency ?? "UGX"}) <span className="text-destructive">*</span></Label>
                <Input
                  id="rent"
                  type="number"
                  min="0"
                  step="1000"
                  value={monthlyRent}
                  onChange={(e) => setMonthlyRent(e.target.value)}
                  placeholder="500000"
                  autoFocus
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="maxOccupants">Max Occupants per Unit</Label>
                <Input
                  id="maxOccupants"
                  type="number"
                  min="1"
                  max="20"
                  value={maxOccupants}
                  onChange={(e) => setMaxOccupants(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Bathroom Type</Label>
                <Select value={bathroomType} onValueChange={setBathroomType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BATHROOM_TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Furnished Status</Label>
                <Select value={furnishedStatus} onValueChange={(v) => setFurnishedStatus(v as FurnishedStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FURNISHED_OPTIONS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Water Source</Label>
                <Select value={waterSource} onValueChange={(v) => setWaterSource(v as WaterSource | "inherit")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WATER_SOURCE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
              <input type="checkbox" checked={hasKitchen} onChange={(e) => setHasKitchen(e.target.checked)} className="rounded border-border" />
              Units have a separate kitchen
            </label>

            <div className="flex justify-between pt-1">
              <Button variant="outline" onClick={() => setStep("configure")}>Back</Button>
              <Button onClick={() => setStep("preview")} disabled={!canTemplate}>
                <Eye className="h-4 w-4" />
                Preview {preview.length} units
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Preview + generate */}
      {step === "preview" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Preview — {preview.length} units
              </CardTitle>
              <CardDescription>
                Review the unit names before creating. Each floor is shown separately.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {byFloor.map(([floor, names]) => (
                <div key={floor}>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">
                    {floor < 0 ? `Basement (level ${floor})` : `Floor ${floor}`} — {names.length} units
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {names.map((n) => (
                      <Badge key={n} variant="secondary" className="font-mono text-xs">{n}</Badge>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Settings summary */}
          <Card>
            <CardContent className="pt-4">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-muted-foreground">Block</dt>        <dd className="font-medium">{block}</dd>
                <dt className="text-muted-foreground">Type</dt>         <dd className="font-medium">{UNIT_TYPES.find(t => t.value === type)?.label}</dd>
                <dt className="text-muted-foreground">Rent</dt>         <dd className="font-medium">{parseFloat(monthlyRent).toLocaleString()} {property?.currency ?? "UGX"}/mo</dd>
                <dt className="text-muted-foreground">Max occupants</dt><dd className="font-medium">{maxOccupants}</dd>
                <dt className="text-muted-foreground">Bathroom</dt>     <dd className="font-medium">{BATHROOM_TYPE_OPTIONS.find(o => o.value === bathroomType)?.label?.split(" (")[0]}</dd>
                <dt className="text-muted-foreground">Furnished</dt>    <dd className="font-medium capitalize">{furnishedStatus.replace("_", " ")}</dd>
              </dl>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep("template")}>Back</Button>
            <Button onClick={handleGenerate} disabled={isPending} loading={isPending}>
              <Plus className="h-4 w-4" />
              Create {preview.length} units
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
