"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Home, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useCreateUnit, useProperty } from "@/hooks/useProperties";
import { toast } from "@/store/useUIStore";
import type { UnitType, FurnishedStatus, WaterSource } from "@/types";

const UNIT_TYPES: { value: UnitType; label: string }[] = [
  { value: "studio",        label: "Studio (0-bed)"   },
  { value: "bedsitter",     label: "Bedsitter"        },
  { value: "one_bed",       label: "1-Bedroom"        },
  { value: "two_bed",       label: "2-Bedroom"        },
  { value: "three_bed",     label: "3-Bedroom"        },
  { value: "four_bed_plus", label: "4-Bedroom+"       },
];

const FURNISHED_OPTIONS: { value: FurnishedStatus; label: string }[] = [
  { value: "unfurnished",    label: "Unfurnished"    },
  { value: "semi_furnished", label: "Semi-furnished" },
  { value: "furnished",      label: "Furnished"      },
];

const WATER_SOURCE_OPTIONS: { value: WaterSource | "inherit"; label: string }[] = [
  { value: "inherit",   label: "Inherit from property" },
  { value: "municipal", label: "NWSC / Municipal"       },
  { value: "borehole",  label: "Borehole"               },
  { value: "tank",      label: "Water Tank"             },
  { value: "multiple",  label: "Multiple Sources"       },
];

const CURRENCIES = ["UGX", "USD", "EUR", "GBP"];

interface Props { params: Promise<{ id: string }> }

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="rounded border-border" />
      {label}
    </label>
  );
}

export default function NewUnitPage({ params }: Props) {
  const { id: propertyId } = use(params);
  const router = useRouter();
  const { data: property } = useProperty(propertyId);
  const { mutate: createUnit, isPending } = useCreateUnit();

  // Basic
  const [name,        setName]        = useState("");
  const [type,        setType]        = useState<UnitType>("one_bed");
  const [floor,       setFloor]       = useState("");
  const [bedrooms,    setBedrooms]    = useState("1");
  const [bathrooms,   setBathrooms]   = useState("1");
  const [area,        setArea]        = useState("");
  const [monthlyRent, setMonthlyRent] = useState("");
  const [currency,    setCurrency]    = useState(property?.currency ?? "UGX");
  const [notes,       setNotes]       = useState("");

  // Uganda features
  const [sittingRooms,       setSittingRooms]       = useState("1");
  const [toilets,            setToilets]            = useState("1");
  const [isSelfContained,    setIsSelfContained]    = useState(true);
  const [hasKitchen,         setHasKitchen]         = useState(true);
  const [hasStore,           setHasStore]           = useState(false);
  const [hasDomesticQuarters,setHasDomesticQuarters]= useState(false);
  const [parkingSpaces,      setParkingSpaces]      = useState("0");
  const [furnishedStatus,    setFurnishedStatus]    = useState<FurnishedStatus>("unfurnished");
  const [waterSource,        setWaterSource]        = useState<WaterSource | "inherit">("inherit");

  const canSubmit = !!name.trim() && !!monthlyRent && parseFloat(monthlyRent) > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    createUnit(
      {
        propertyId,
        data: {
          name:                name.trim(),
          type,
          floor:               floor ? parseInt(floor) : undefined,
          bedrooms:            parseInt(bedrooms) || 1,
          bathrooms:           parseInt(bathrooms) || 1,
          area:                area ? parseFloat(area) : undefined,
          monthlyRent:         parseFloat(monthlyRent),
          currency,
          notes:               notes.trim() || undefined,
          amenities:           [],
          images:              [],
          sittingRooms:        parseInt(sittingRooms) || 1,
          toilets:             parseInt(toilets) || 1,
          isSelfContained,
          hasKitchen,
          hasStore,
          hasDomesticQuarters,
          parkingSpaces:       parseInt(parkingSpaces) || 0,
          furnishedStatus,
          waterSource:         waterSource === "inherit" ? undefined : waterSource,
        } as any,
      },
      {
        onSuccess: () => {
          toast.success("Unit added", `${name} has been added to ${property?.name ?? "the property"}`);
          router.push(`/properties/${propertyId}/units`);
        },
        onError: (err: any) => {
          toast.error("Failed to add unit", err?.response?.data?.detail ?? "Please try again");
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
          <h1 className="text-2xl font-bold tracking-tight">Add Unit</h1>
          <p className="text-sm text-muted-foreground">
            {property?.name ? `Adding a new unit to ${property.name}` : "Adding a new unit to this property"}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Unit Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Home className="h-4 w-4" />
              Unit Details
            </CardTitle>
            <CardDescription>Basic information about this unit</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Name + Type */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Unit Name <span className="text-destructive">*</span></Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Unit 1A, Room 3, Studio B"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="type">Unit Type <span className="text-destructive">*</span></Label>
                <Select value={type} onValueChange={(v) => setType(v as UnitType)}>
                  <SelectTrigger id="type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNIT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Rent + Currency */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="rent">Monthly Rent <span className="text-destructive">*</span></Label>
                <Input
                  id="rent"
                  type="number"
                  min="0"
                  step="1000"
                  value={monthlyRent}
                  onChange={(e) => setMonthlyRent(e.target.value)}
                  placeholder="500000"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="currency">Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger id="currency"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Bedrooms + Bathrooms + Floor */}
            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="bedrooms">Bedrooms</Label>
                <Input id="bedrooms" type="number" min="0" max="20" value={bedrooms}
                  onChange={(e) => setBedrooms(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bathrooms">Bathrooms</Label>
                <Input id="bathrooms" type="number" min="0" max="20" value={bathrooms}
                  onChange={(e) => setBathrooms(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="floor">Floor</Label>
                <Input id="floor" type="number" min="0" value={floor}
                  onChange={(e) => setFloor(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="area">Area (m²)</Label>
                <Input id="area" type="number" min="0" step="0.5" value={area}
                  onChange={(e) => setArea(e.target.value)} placeholder="e.g. 35" />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes <span className="text-muted-foreground text-xs">optional</span></Label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Any additional details about this unit…"
                className="w-full rounded-[6px] border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              />
            </div>
          </CardContent>
        </Card>

        {/* Uganda Features */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Uganda Features</CardTitle>
            <CardDescription>Room breakdown, facilities and furnishing</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Room counts */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="sittingRooms">Sitting Rooms</Label>
                <Input id="sittingRooms" type="number" min="0" max="20" value={sittingRooms}
                  onChange={(e) => setSittingRooms(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="toilets">Toilets</Label>
                <Input id="toilets" type="number" min="0" max="20" value={toilets}
                  onChange={(e) => setToilets(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="parkingSpaces">Parking Spaces</Label>
                <Input id="parkingSpaces" type="number" min="0" value={parkingSpaces}
                  onChange={(e) => setParkingSpaces(e.target.value)} />
              </div>
            </div>

            {/* Furnishing + Water */}
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
                <Label>Water Source <span className="text-muted-foreground text-xs">(overrides property)</span></Label>
                <Select value={waterSource} onValueChange={(v) => setWaterSource(v as WaterSource | "inherit")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WATER_SOURCE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Feature toggles */}
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <ToggleRow label="Self-contained (own bathroom + kitchen)" checked={isSelfContained} onChange={setIsSelfContained} />
              <ToggleRow label="Separate kitchen" checked={hasKitchen} onChange={setHasKitchen} />
              <ToggleRow label="Store room" checked={hasStore} onChange={setHasStore} />
              <ToggleRow label="Domestic quarters (BQ)" checked={hasDomesticQuarters} onChange={setHasDomesticQuarters} />
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
          <Button type="submit" disabled={!canSubmit} loading={isPending}>
            <Plus className="h-4 w-4" />
            Add Unit
          </Button>
        </div>
      </form>
    </div>
  );
}
