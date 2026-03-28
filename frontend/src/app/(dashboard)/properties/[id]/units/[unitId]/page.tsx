"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Home,
  User,
  Banknote,
  CalendarDays,
  Wifi,
  Car,
  Droplets,
  Flame,
  ShieldCheck,
  Wind,
  Tv,
  Utensils,
  BedDouble,
  Bath,
  Maximize2,
  Wrench,
  ClipboardList,
  Edit,
  X,
  Save,
  Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageSkeleton } from "@/components/common/LoadingSkeleton";
import { formatCurrency, formatDate } from "@/utils/formatters";
import { useUnit, useProperty, useUpdateUnit } from "@/hooks/useProperties";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/utils/cn";
import type { Unit, UnitStatus, UnitType } from "@/types";

interface Props {
  params: Promise<{ id: string; unitId: string }>;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<UnitStatus, { label: string; color: string; bg: string }> = {
  available:   { label: "Available",   color: "text-emerald-700", bg: "bg-emerald-100 dark:bg-emerald-950/40" },
  occupied:    { label: "Occupied",    color: "text-indigo-700",  bg: "bg-indigo-100 dark:bg-indigo-950/40"  },
  reserved:    { label: "Reserved",    color: "text-amber-700",   bg: "bg-amber-100 dark:bg-amber-950/40"    },
  maintenance: { label: "Maintenance", color: "text-red-700",     bg: "bg-red-100 dark:bg-red-950/40"        },
};

const UNIT_TYPES: { value: UnitType; label: string }[] = [
  { value: "single",  label: "Single"   },
  { value: "double",  label: "Double"   },
  { value: "studio",  label: "Studio"   },
  { value: "ensuite", label: "En-suite" },
  { value: "shared",  label: "Shared"   },
];

const UNIT_STATUSES: { value: UnitStatus; label: string }[] = [
  { value: "available",   label: "Available"   },
  { value: "occupied",    label: "Occupied"    },
  { value: "reserved",    label: "Reserved"    },
  { value: "maintenance", label: "Maintenance" },
];

const COMMON_AMENITIES = [
  "WiFi", "Parking", "Hot Water", "CCTV", "Generator", "Security",
  "Air Conditioning", "Balcony", "Kitchen", "Laundry",
];

// ── Amenity icons ──────────────────────────────────────────────────────────────

const AMENITY_ICONS: Record<string, React.ElementType> = {
  wifi:              Wifi,
  WiFi:              Wifi,
  parking:           Car,
  Parking:           Car,
  water:             Droplets,
  "Hot Water":       Droplets,
  gas:               Flame,
  security:          ShieldCheck,
  Security:          ShieldCheck,
  "Air Conditioning": Wind,
  aircon:            Wind,
  tv:                Tv,
  kitchen:           Utensils,
  Kitchen:           Utensils,
};

function AmenityChip({ label }: { label: string }) {
  const Icon = AMENITY_ICONS[label] ?? ShieldCheck;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium bg-muted/40">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      {label}
    </span>
  );
}

function AmenityToggle({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        checked
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-muted/30 text-muted-foreground hover:border-primary/50",
      )}
    >
      {label}
    </button>
  );
}

// ── Edit form ─────────────────────────────────────────────────────────────────

function EditForm({
  unit,
  propertyId,
  onCancel,
}: {
  unit: Unit;
  propertyId: string;
  onCancel: () => void;
}) {
  const { mutate: update, isPending } = useUpdateUnit();

  const [name,        setName]        = useState(unit.name);
  const [type,        setType]        = useState<UnitType>(unit.type);
  const [status,      setStatus]      = useState<UnitStatus>(unit.status);
  const [monthlyRent, setMonthlyRent] = useState(unit.monthlyRent);
  const [bedrooms,    setBedrooms]    = useState(unit.bedrooms);
  const [bathrooms,   setBathrooms]   = useState(unit.bathrooms);
  const [floor,       setFloor]       = useState<string>(unit.floor !== undefined ? String(unit.floor) : "");
  const [area,        setArea]        = useState<string>(unit.area !== undefined ? String(unit.area) : "");
  const [amenities,   setAmenities]   = useState<string[]>(unit.amenities ?? []);
  const [notes,       setNotes]       = useState(unit.notes ?? "");

  function toggleAmenity(a: string) {
    setAmenities((prev) => prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    update(
      {
        propertyId,
        unitId: unit.id,
        data: {
          name,
          type,
          status,
          monthlyRent,
          bedrooms,
          bathrooms,
          floor:  floor !== "" ? parseInt(floor) : undefined,
          area:   area  !== "" ? parseFloat(area)  : undefined,
          amenities,
          notes:  notes || undefined,
        },
      },
      { onSuccess: onCancel },
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-4 max-w-2xl">
      {/* ── Basic info ─────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Home className="h-4 w-4" />
            Unit Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="uname">Unit Name / Reference *</Label>
            <Input
              id="uname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="utype">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as UnitType)}>
                <SelectTrigger id="utype"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNIT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ustatus">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as UnitStatus)}>
                <SelectTrigger id="ustatus"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNIT_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="ufloor">Floor</Label>
              <Input
                id="ufloor"
                type="number"
                min={0}
                value={floor}
                onChange={(e) => setFloor(e.target.value)}
                placeholder="e.g. 2"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="uarea">Area (m²)</Label>
              <Input
                id="uarea"
                type="number"
                min={0}
                step={0.1}
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="e.g. 45"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Financials ─────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Banknote className="h-4 w-4" />
            Rent & Capacity
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="urent">Monthly Rent (UGX) *</Label>
            <Input
              id="urent"
              type="number"
              min={0}
              value={monthlyRent}
              onChange={(e) => setMonthlyRent(parseInt(e.target.value) || 0)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="ubeds">Bedrooms</Label>
              <Input
                id="ubeds"
                type="number"
                min={0}
                max={10}
                value={bedrooms}
                onChange={(e) => setBedrooms(parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ubaths">Bathrooms</Label>
              <Input
                id="ubaths"
                type="number"
                min={0}
                max={10}
                value={bathrooms}
                onChange={(e) => setBathrooms(parseInt(e.target.value) || 0)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Amenities ─────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Wifi className="h-4 w-4" />
            Amenities
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {COMMON_AMENITIES.map((a) => (
              <AmenityToggle
                key={a}
                label={a}
                checked={amenities.includes(a)}
                onToggle={() => toggleAmenity(a)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Notes ─────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Notes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any notes about this unit..."
            rows={3}
          />
        </CardContent>
      </Card>

      <Separator />

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          <X className="h-4 w-4" />
          Cancel
        </Button>
        <Button type="submit" loading={isPending}>
          <Save className="h-4 w-4" />
          Save Changes
        </Button>
      </div>
    </form>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function UnitDetailPage({ params }: Props) {
  const { id: propertyId, unitId } = use(params);
  const router = useRouter();
  const { data: unit, isLoading } = useUnit(propertyId, unitId);
  const { data: property } = useProperty(propertyId);
  const { can } = usePermissions();
  const canEdit = can("properties:write");
  const [editing, setEditing] = useState(false);

  if (isLoading) return <PageSkeleton />;
  if (!unit) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Home className="h-12 w-12 text-muted-foreground" />
        <p className="text-sm font-medium">Unit not found</p>
        <Button variant="outline" size="sm" onClick={() => router.back()}>Go back</Button>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[unit.status];

  return (
    <div className="space-y-6 max-w-4xl">
      {/* ── Header ────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight">{unit.name}</h1>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                  statusCfg.color,
                  statusCfg.bg,
                )}
              >
                {statusCfg.label}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {property?.name ?? propertyId} ·{" "}
              <span className="capitalize">{unit.type.replace("_", " ")}</span>
            </p>
          </div>
        </div>

        {!editing && (
          <div className="flex gap-2 shrink-0">
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Edit className="h-3.5 w-3.5" />
                Edit
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => router.push(`/maintenance?unitId=${unitId}`)}>
              <Wrench className="h-3.5 w-3.5" />
              Maintenance
            </Button>
            <Button size="sm" onClick={() => router.push(`/inspections/new?propertyId=${propertyId}&unitId=${unitId}`)}>
              <ClipboardList className="h-3.5 w-3.5" />
              Inspect
            </Button>
          </div>
        )}
      </div>

      {editing ? (
        <EditForm
          unit={unit}
          propertyId={propertyId}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          {/* ── Key stats ──────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {
                label: "Monthly Rent",
                value: formatCurrency(unit.monthlyRent, unit.currency),
                icon: Banknote,
                color: "text-emerald-600",
                bg: "bg-emerald-100 dark:bg-emerald-950/30",
              },
              {
                label: "Bedrooms",
                value: unit.bedrooms,
                icon: BedDouble,
                color: "text-blue-600",
                bg: "bg-blue-100 dark:bg-blue-950/30",
              },
              {
                label: "Bathrooms",
                value: unit.bathrooms,
                icon: Bath,
                color: "text-violet-600",
                bg: "bg-violet-100 dark:bg-violet-950/30",
              },
              {
                label: "Area",
                value: unit.area ? `${unit.area} m²` : "—",
                icon: Maximize2,
                color: "text-amber-600",
                bg: "bg-amber-100 dark:bg-amber-950/30",
              },
            ].map((s) => (
              <Card key={s.label}>
                <CardContent className="pt-4 pb-3">
                  <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center mb-2", s.bg)}>
                    <s.icon className={cn("h-4 w-4", s.color)} />
                  </div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className={cn("text-xl font-bold mt-0.5", s.color)}>{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ── Unit details ──────────────────────────── */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Home className="h-4 w-4" />
                  Unit Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Unit ID</span>
                  <span className="font-mono text-xs">{unit.id}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type</span>
                  <span className="capitalize">{unit.type.replace("_", " ")}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <span className={cn("capitalize font-medium", statusCfg.color)}>{statusCfg.label}</span>
                </div>
                {unit.floor !== undefined && (
                  <>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Floor</span>
                      <span>{unit.floor === 0 ? "Ground" : `Floor ${unit.floor}`}</span>
                    </div>
                  </>
                )}
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last Inspection</span>
                  <span>{unit.lastInspectionDate ? formatDate(unit.lastInspectionDate) : "—"}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Added</span>
                  <span>{formatDate(unit.createdAt)}</span>
                </div>
                {unit.notes && (
                  <>
                    <Separator />
                    <div className="flex flex-col gap-1">
                      <span className="text-muted-foreground">Notes</span>
                      <p className="text-xs leading-relaxed">{unit.notes}</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* ── Occupancy ───────────────────────────── */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Occupancy
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {unit.status === "occupied" && unit.currentTenantId ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tenant ID</span>
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-sm"
                        onClick={() => router.push(`/tenants/${unit.currentTenantId}`)}
                      >
                        {unit.currentTenantId}
                      </Button>
                    </div>
                    {unit.currentLeaseId && (
                      <>
                        <Separator />
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Lease ID</span>
                          <Button
                            variant="link"
                            size="sm"
                            className="h-auto p-0 text-sm"
                            onClick={() => router.push(`/leases/${unit.currentLeaseId}`)}
                          >
                            {unit.currentLeaseId}
                          </Button>
                        </div>
                      </>
                    )}
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Rent</span>
                      <span className="font-semibold text-emerald-600">
                        {formatCurrency(unit.monthlyRent, unit.currency)}/mo
                      </span>
                    </div>
                    <Separator />
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => router.push(`/tenants/${unit.currentTenantId}`)}
                    >
                      <User className="h-3.5 w-3.5" />
                      View Tenant Profile
                    </Button>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 gap-3">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                      <User className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {unit.status === "available"   ? "Unit is vacant"        :
                       unit.status === "reserved"    ? "Unit is reserved"      :
                                                       "Under maintenance"}
                    </p>
                    {unit.status === "available" && (
                      <Button size="sm" onClick={() => router.push(`/leases/new?unitId=${unitId}&propertyId=${propertyId}`)}>
                        <CalendarDays className="h-3.5 w-3.5" />
                        Create Lease
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Amenities ──────────────────────────────── */}
          {unit.amenities.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Amenities</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {unit.amenities.map((a) => (
                    <AmenityChip key={a} label={a} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Quick actions ──────────────────────────── */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => router.push(`/properties/${propertyId}/units`)}
            >
              <Home className="h-4 w-4" />
              All Units
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push(`/inspections?propertyId=${propertyId}&unitId=${unitId}`)}
            >
              <ClipboardList className="h-4 w-4" />
              Inspection History
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push(`/maintenance?unitId=${unitId}`)}
            >
              <Wrench className="h-4 w-4" />
              Maintenance Issues
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
