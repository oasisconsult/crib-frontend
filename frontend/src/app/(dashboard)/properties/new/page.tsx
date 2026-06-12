"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  MapPin,
  Settings2,
  Wand2,
  Trash2,
  Plus,
  CheckCircle2,
  Home,
  ShieldCheck,
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
import { useCreateProperty, useBulkCreateUnits } from "@/hooks/useProperties";
import { LocationSearch } from "@/components/ui/location-search";
import { GeocodeField } from "@/components/ui/geocode-field";
import { settingsApi } from "@/services/api/settings";
import { cn } from "@/utils/cn";
import type { UnitType, FurnishedStatus, WaterSource, BackupPower, InternetType, CompoundType } from "@/types";

// ── Constants ─────────────────────────────────────────────────────────────────

const PROPERTY_TYPES = [
  { value: "flat",            label: "Flat / Apartment"  },
  { value: "house",           label: "House"              },
  { value: "bungalow",        label: "Bungalow"           },
  { value: "maisonette",      label: "Maisonette"         },
  { value: "townhouse",       label: "Townhouse"          },
  { value: "villa",           label: "Villa"              },
  { value: "bedsitter_block", label: "Bedsitter Block / Lodge" },
  { value: "hostel",          label: "Hostel"             },
  { value: "commercial",      label: "Commercial"         },
];

const PROPERTY_STATUSES = [
  { value: "active",      label: "Active",      description: "Open and accepting tenants" },
  { value: "inactive",    label: "Inactive",    description: "Temporarily unlisted" },
  { value: "maintenance", label: "Maintenance", description: "Under renovation or repairs" },
];

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

const WATER_SOURCE_OPTIONS: { value: WaterSource; label: string }[] = [
  { value: "municipal", label: "NWSC / Municipal" },
  { value: "borehole",  label: "Borehole"         },
  { value: "tank",      label: "Water Tank"       },
  { value: "multiple",  label: "Multiple Sources" },
];

const BACKUP_POWER_OPTIONS: { value: BackupPower; label: string }[] = [
  { value: "none",      label: "None"             },
  { value: "solar",     label: "Solar"            },
  { value: "generator", label: "Generator"        },
  { value: "both",      label: "Solar + Generator"},
];

const INTERNET_TYPE_OPTIONS: { value: InternetType; label: string }[] = [
  { value: "none",  label: "None"   },
  { value: "wifi",  label: "Wi-Fi"  },
  { value: "fibre", label: "Fibre"  },
];

const COMPOUND_TYPE_OPTIONS: { value: CompoundType; label: string }[] = [
  { value: "private", label: "Private Compound" },
  { value: "shared",  label: "Shared Compound"  },
];

const GEOCODE_RE = /^[A-Z0-9]+-[A-Z0-9]+$/;

const DEFAULT_RULES = {
  gracePeriodDays: 5,
  lateFeeType: "flat" as const,
  lateFeeValue: 50000,
  depositMonths: 2,
  advanceRentMonths: 2,
  minimumLeaseMonths: 6,
  maxOccupants: 2,
  noticePeriodDays: 30,
  allowSubletting: false,
  allowPets: false,
  allowSmoking: false,
  rentDayOfMonth: 1,
  billingCurrency: "UGX",
  maintenanceWindowHours: 24,
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface UnitDraft {
  _key: string;
  name: string;
  type: UnitType;
  monthlyRent: number;
  bedrooms: number;
  bathrooms: number;
  floor: number | "";
  isSelfContained: boolean;
  furnishedStatus: FurnishedStatus;
}

// ── Step indicator ────────────────────────────────────────────────────────────

function StepBar({ step }: { step: 1 | 2 }) {
  return (
    <div className="flex items-center gap-2">
      {[
        { n: 1, label: "Property Details" },
        { n: 2, label: "Configure Units"  },
      ].map(({ n, label }, i) => (
        <div key={n} className="flex items-center gap-2">
          {i > 0 && <div className={cn("h-px w-8 sm:w-16", step > 1 ? "bg-primary" : "bg-border")} />}
          <div className="flex items-center gap-2">
            <div className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold border-2 transition-colors",
              step === n
                ? "border-emerald-600 dark:border-emerald-500 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-bold"
                : step > n
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-background text-muted-foreground",
            )}>
              {step > n ? <CheckCircle2 className="h-4 w-4" /> : n}
            </div>
            <span className={cn("text-sm hidden sm:inline", step === n ? "font-medium text-foreground" : "text-muted-foreground")}>
              {label}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Unit generator ────────────────────────────────────────────────────────────

interface GeneratorConfig {
  count: number;
  prefix: string;
  startNumber: number;
  defaultType: UnitType;
  defaultRent: number;
  defaultBeds: number;
  defaultBaths: number;
  defaultSelfContained: boolean;
  defaultFurnished: FurnishedStatus;
  floorsEnabled: boolean;
  unitsPerFloor: number;
  startFloor: number;
}

function generateUnits(cfg: GeneratorConfig): UnitDraft[] {
  return Array.from({ length: cfg.count }, (_, i) => {
    const num = cfg.startNumber + i;
    const floor = cfg.floorsEnabled
      ? cfg.startFloor + Math.floor(i / cfg.unitsPerFloor)
      : ("" as const);
    return {
      _key: `draft-${i}`,
      name: `${cfg.prefix} ${num}`,
      type: cfg.defaultType,
      monthlyRent: cfg.defaultRent,
      bedrooms: cfg.defaultBeds,
      bathrooms: cfg.defaultBaths,
      floor,
      isSelfContained: cfg.defaultSelfContained,
      furnishedStatus: cfg.defaultFurnished,
    };
  });
}

// ── Inline-editable unit row ──────────────────────────────────────────────────

function UnitRow({
  unit,
  index,
  onChange,
  onRemove,
}: {
  unit: UnitDraft;
  index: number;
  onChange: (patch: Partial<UnitDraft>) => void;
  onRemove: () => void;
}) {
  return (
    <tr className="group border-b last:border-0 hover:bg-primary/5 transition-colors">
      <td className="py-1.5 pl-3 pr-2 text-xs text-muted-foreground w-8">{index + 1}</td>

      {/* Name */}
      <td className="py-1 px-1">
        <input
          value={unit.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="w-full min-w-[90px] rounded border border-transparent bg-transparent px-2 py-1 text-sm focus:border-border focus:bg-background focus:outline-none"
        />
      </td>

      {/* Type */}
      <td className="py-1 px-1">
        <Select value={unit.type} onValueChange={(v) => onChange({ type: v as UnitType })}>
          <SelectTrigger className="h-7 text-xs border-transparent bg-transparent shadow-none focus:border-border focus:bg-background w-full min-w-[100px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {UNIT_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>

      {/* Rent */}
      <td className="py-1 px-1">
        <input
          type="number"
          min={0}
          value={unit.monthlyRent}
          onChange={(e) => onChange({ monthlyRent: parseInt(e.target.value) || 0 })}
          className="w-full min-w-[80px] rounded border border-transparent bg-transparent px-2 py-1 text-sm focus:border-border focus:bg-background focus:outline-none text-right"
        />
      </td>

      {/* Beds */}
      <td className="py-1 px-1">
        <input
          type="number"
          min={0}
          max={10}
          value={unit.bedrooms}
          onChange={(e) => onChange({ bedrooms: parseInt(e.target.value) || 0 })}
          className="w-10 rounded border border-transparent bg-transparent px-1 py-1 text-sm text-center focus:border-border focus:bg-background focus:outline-none"
        />
      </td>

      {/* Baths */}
      <td className="py-1 px-1">
        <input
          type="number"
          min={0}
          max={10}
          value={unit.bathrooms}
          onChange={(e) => onChange({ bathrooms: parseInt(e.target.value) || 0 })}
          className="w-10 rounded border border-transparent bg-transparent px-1 py-1 text-sm text-center focus:border-border focus:bg-background focus:outline-none"
        />
      </td>

      {/* SC */}
      <td className="py-1 px-1 text-center">
        <input
          type="checkbox"
          checked={unit.isSelfContained}
          onChange={(e) => onChange({ isSelfContained: e.target.checked })}
          className="rounded border-border"
          title="Self-contained"
        />
      </td>

      {/* Furnished */}
      <td className="py-1 px-1">
        <Select value={unit.furnishedStatus} onValueChange={(v) => onChange({ furnishedStatus: v as FurnishedStatus })}>
          <SelectTrigger className="h-7 text-xs border-transparent bg-transparent shadow-none focus:border-border focus:bg-background w-full min-w-[90px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FURNISHED_OPTIONS.map((f) => (
              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>

      {/* Floor */}
      <td className="py-1 px-1">
        <input
          type="number"
          min={0}
          value={unit.floor === "" ? "" : unit.floor}
          onChange={(e) => onChange({ floor: e.target.value === "" ? "" : parseInt(e.target.value) })}
          placeholder="—"
          className="w-10 rounded border border-transparent bg-transparent px-1 py-1 text-sm text-center focus:border-border focus:bg-background focus:outline-none"
        />
      </td>

      {/* Delete */}
      <td className="py-1 pr-3 pl-1">
        <button
          type="button"
          onClick={onRemove}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
          aria-label="Remove unit"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}

// ── Checkbox toggle row ───────────────────────────────────────────────────────

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-border"
      />
      {label}
    </label>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function NewPropertyPage() {
  const router = useRouter();
  const { mutate: createProperty, isPending: creatingProp } = useCreateProperty();
  const { mutate: bulkCreate,     isPending: creatingUnits } = useBulkCreateUnits();
  const isSubmitting = creatingProp || creatingUnits;

  const tableRef = useRef<HTMLDivElement>(null);

  // ── Step 1: Property details ───────────────────────────────────────────────
  const [step, setStep] = useState<1 | 2>(1);
  const [propName,     setPropName]     = useState("");
  const [propType,     setPropType]     = useState("flat");
  const [propStatus,   setPropStatus]   = useState("active");
  const [isSingleUnit, setIsSingleUnit] = useState(false);
  const [line1,        setLine1]        = useState("");
  const [city,         setCity]         = useState("Kampala");
  const [region,       setRegion]       = useState("Central Region");
  const [geocode,      setGeocode]      = useState("");
  const [village,      setVillage]      = useState("");
  const [parish,       setParish]       = useState("");
  const [subCounty,    setSubCounty]    = useState("");
  const [county,       setCounty]       = useState("");
  const [district,     setDistrict]     = useState("");
  const [geoboxSettings, setGeoboxSettings] = useState<Record<string, string>>({});

  // ── Property features ──────────────────────────────────────────────────────
  const [totalFloors,        setTotalFloors]        = useState(1);
  const [yearBuilt,          setYearBuilt]          = useState("");
  const [landSizeAcres,      setLandSizeAcres]      = useState("");
  const [waterSource,        setWaterSource]        = useState<WaterSource>("municipal");
  const [backupPower,        setBackupPower]        = useState<BackupPower>("none");
  const [internetType,       setInternetType]       = useState<InternetType>("none");
  const [compoundType,       setCompoundType]       = useState<CompoundType>("private");
  const [hasPerimeterWall,   setHasPerimeterWall]   = useState(false);
  const [hasGate,            setHasGate]            = useState(false);
  const [hasGuard,           setHasGuard]           = useState(false);
  const [hasCctv,            setHasCctv]            = useState(false);
  const [totalParkingSpaces, setTotalParkingSpaces] = useState(0);

  // ── Single-unit overrides (when isSingleUnit = true) ──────────────────────
  const [suBedrooms,       setSuBedrooms]       = useState(1);
  const [suBathrooms,      setSuBathrooms]      = useState(1);
  const [suSittingRooms,   setSuSittingRooms]   = useState(1);
  const [suSelfContained,  setSuSelfContained]  = useState(true);
  const [suFurnished,      setSuFurnished]      = useState<FurnishedStatus>("unfurnished");

  useEffect(() => {
    settingsApi.getPublic().then(setGeoboxSettings).catch(() => {});
  }, []);

  function applyHierarchy(h: string[]) {
    if (h[0]) setDistrict(h[0]);
    if (h[1]) setCounty(h[1]);
    if (h[2]) setSubCounty(h[2]);
    if (h[3]) setParish(h[3]);
    if (h[4]) setVillage(h[4]);
  }

  // ── Step 2: Unit generator ─────────────────────────────────────────────────
  const [genCount,           setGenCount]       = useState(10);
  const [genPrefix,          setGenPrefix]      = useState("Unit");
  const [genStartNum,        setGenStartNum]    = useState(1);
  const [genType,            setGenType]        = useState<UnitType>("one_bed");
  const [genRent,            setGenRent]        = useState(800000);
  const [genBeds,            setGenBeds]        = useState(1);
  const [genBaths,           setGenBaths]       = useState(1);
  const [genSelfContained,   setGenSelfContained]   = useState(true);
  const [genFurnished,       setGenFurnished]       = useState<FurnishedStatus>("unfurnished");
  const [genFloors,          setGenFloors]      = useState(false);
  const [genUPF,             setGenUPF]         = useState(10);
  const [genStartFloor,      setGenStartFloor]  = useState(1);
  const [units, setUnits] = useState<UnitDraft[]>([]);
  const [generated, setGenerated] = useState(false);

  function handleGenerate() {
    const drafts = generateUnits({
      count: Math.min(genCount, 500),
      prefix: genPrefix || "Unit",
      startNumber: genStartNum,
      defaultType: genType,
      defaultRent: genRent,
      defaultBeds: genBeds,
      defaultBaths: genBaths,
      defaultSelfContained: genSelfContained,
      defaultFurnished: genFurnished,
      floorsEnabled: genFloors,
      unitsPerFloor: genUPF,
      startFloor: genStartFloor,
    });
    setUnits(drafts);
    setGenerated(true);
    setTimeout(() => tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function updateUnit(key: string, patch: Partial<UnitDraft>) {
    setUnits((prev) => prev.map((u) => u._key === key ? { ...u, ...patch } : u));
  }

  function removeUnit(key: string) {
    setUnits((prev) => prev.filter((u) => u._key !== key));
  }

  function addBlankUnit() {
    const n = units.length + genStartNum;
    setUnits((prev) => [...prev, {
      _key: `draft-manual-${Date.now()}`,
      name: `${genPrefix} ${n}`,
      type: genType,
      monthlyRent: genRent,
      bedrooms: genBeds,
      bathrooms: genBaths,
      floor: "",
      isSelfContained: genSelfContained,
      furnishedStatus: genFurnished,
    }]);
  }

  const geocodeInvalid = geocode ? !GEOCODE_RE.test(geocode) : false;

  // ── Submit ─────────────────────────────────────────────────────────────────
  function handleSubmit() {
    if (!propName || !line1 || geocodeInvalid) return;

    const propertyFeatures = {
      totalFloors,
      yearBuilt:          yearBuilt ? parseInt(yearBuilt) : undefined,
      landSizeAcres:      landSizeAcres ? parseFloat(landSizeAcres) : undefined,
      waterSource,
      backupPower,
      internetType,
      compoundType,
      hasPerimeterWall,
      hasGate,
      hasGuard,
      hasCctv,
      totalParkingSpaces,
    };

    createProperty(
      {
        name:    propName,
        type:    propType as "flat",
        status:  propStatus as "active",
        address: {
          line1, city, state: region, postcode: "00256", country: "Uganda",
          ...(village   && { village }),
          ...(parish    && { parish }),
          ...(subCounty && { subCounty }),
          ...(county    && { county }),
          ...(district  && { district }),
        },
        geocode:     geocode || undefined,
        rules:       DEFAULT_RULES,
        currency:    "UGX",
        tags:        [],
        amenities:   [],
        isSingleUnit,
        ...propertyFeatures,
        ...(isSingleUnit && {
          singleUnitOverrides: {
            bedrooms:      suBedrooms,
            bathrooms:     suBathrooms,
            sittingRooms:  suSittingRooms,
            isSelfContained: suSelfContained,
            furnishedStatus: suFurnished,
          },
        }),
      } as any,
      {
        onSuccess: (property) => {
          if (isSingleUnit || units.length === 0) {
            router.push(`/properties/${property.id}`);
            return;
          }
          bulkCreate(
            {
              propertyId: property.id,
              units: units.map((u) => ({
                name:             u.name,
                type:             u.type,
                status:           "available" as const,
                monthlyRent:      u.monthlyRent,
                currency:         "UGX",
                bedrooms:         u.bedrooms,
                bathrooms:        u.bathrooms,
                floor:            u.floor === "" ? undefined : u.floor,
                isSelfContained:  u.isSelfContained,
                furnishedStatus:  u.furnishedStatus,
                amenities:        [],
                images:           [],
              })),
            },
            { onSuccess: () => router.push(`/properties/${property.id}`) },
          );
        },
      },
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon-sm" onClick={() => step === 1 ? router.back() : setStep(1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Add Property</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Register a new property in your portfolio</p>
        </div>
        <StepBar step={step} />
      </div>

      {/* ── STEP 1: Property details ──────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          {/* Property Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Property Details
              </CardTitle>
              <CardDescription>Name, type and status</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Property Name *</Label>
                <Input
                  id="name"
                  value={propName}
                  onChange={(e) => setPropName(e.target.value)}
                  placeholder="e.g. Kololo Heights Apartments"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ptype">Property Type *</Label>
                  <Select value={propType} onValueChange={setPropType}>
                    <SelectTrigger id="ptype"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PROPERTY_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pstatus">Status</Label>
                  <Select value={propStatus} onValueChange={setPropStatus}>
                    <SelectTrigger id="pstatus"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PROPERTY_STATUSES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {PROPERTY_STATUSES.find((s) => s.value === propStatus)?.description}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Address */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Address
              </CardTitle>
              <CardDescription>Physical location in Uganda</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="line1">Street / Plot *</Label>
                <Input
                  id="line1"
                  value={line1}
                  onChange={(e) => setLine1(e.target.value)}
                  placeholder="e.g. Plot 24, Acacia Avenue"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="geocode">GeoBox Geocode <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                <GeocodeField
                  id="geocode"
                  value={geocode}
                  onChange={setGeocode}
                  onHierarchyFound={applyHierarchy}
                  portalUrl={geoboxSettings["geobox.portal_url"]}
                  whatsappNumber={geoboxSettings["geobox.whatsapp_number"]}
                  whatsappCreateMessage={geoboxSettings["geobox.whatsapp_create_message"]}
                  hierarchyNotFoundMessage={geoboxSettings["geobox.hierarchy_not_found_message"]}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="city">Village / Area *</Label>
                  <LocationSearch
                    id="city"
                    value={city}
                    onChange={(val, hierarchy) => {
                      setCity(val);
                      if (hierarchy) applyHierarchy(hierarchy);
                    }}
                    placeholder="e.g. Ntinda, Kampala"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="region">Region</Label>
                  <Input id="region" value={region} onChange={(e) => setRegion(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="parish">Parish</Label>
                  <Input id="parish" value={parish} onChange={(e) => setParish(e.target.value)} placeholder="e.g. Ntinda" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="subCounty">Sub-county / Division</Label>
                  <Input id="subCounty" value={subCounty} onChange={(e) => setSubCounty(e.target.value)} placeholder="e.g. Nakawa Division" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="county">County</Label>
                  <Input id="county" value={county} onChange={(e) => setCounty(e.target.value)} placeholder="e.g. Kampala City" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="district">District</Label>
                  <Input id="district" value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="e.g. Kampala" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Property Features */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />
                Property Features
              </CardTitle>
              <CardDescription>Infrastructure and utilities</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Structure */}
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="totalFloors">Floors</Label>
                  <Input
                    id="totalFloors"
                    type="number"
                    min={1}
                    max={200}
                    value={totalFloors}
                    onChange={(e) => setTotalFloors(parseInt(e.target.value) || 1)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="yearBuilt">Year Built <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Input
                    id="yearBuilt"
                    type="number"
                    min={1800}
                    max={2100}
                    value={yearBuilt}
                    onChange={(e) => setYearBuilt(e.target.value)}
                    placeholder="e.g. 2015"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="landSize">Land Size (acres) <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Input
                    id="landSize"
                    type="number"
                    min={0}
                    step={0.01}
                    value={landSizeAcres}
                    onChange={(e) => setLandSizeAcres(e.target.value)}
                    placeholder="e.g. 0.5"
                  />
                </div>
              </div>

              <Separator />

              {/* Utilities */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Water Source</Label>
                  <Select value={waterSource} onValueChange={(v) => setWaterSource(v as WaterSource)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {WATER_SOURCE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Backup Power</Label>
                  <Select value={backupPower} onValueChange={(v) => setBackupPower(v as BackupPower)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BACKUP_POWER_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Internet</Label>
                  <Select value={internetType} onValueChange={(v) => setInternetType(v as InternetType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {INTERNET_TYPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Compound</Label>
                  <Select value={compoundType} onValueChange={(v) => setCompoundType(v as CompoundType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COMPOUND_TYPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              {/* Security & parking */}
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Security &amp; Access</p>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  <ToggleRow label="Perimeter Wall" checked={hasPerimeterWall} onChange={setHasPerimeterWall} />
                  <ToggleRow label="Gate" checked={hasGate} onChange={setHasGate} />
                  <ToggleRow label="Guard / Watchman" checked={hasGuard} onChange={setHasGuard} />
                  <ToggleRow label="CCTV" checked={hasCctv} onChange={setHasCctv} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="parking">Total Parking Spaces</Label>
                <Input
                  id="parking"
                  type="number"
                  min={0}
                  className="w-32"
                  value={totalParkingSpaces}
                  onChange={(e) => setTotalParkingSpaces(parseInt(e.target.value) || 0)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Whole-property toggle */}
          <Card
            className={cn(
              "cursor-pointer border-2 transition-colors",
              isSingleUnit
                ? "border-emerald-500 dark:border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10"
                : "border-border hover:border-primary/40",
            )}
            onClick={() => setIsSingleUnit((v) => !v)}
            role="checkbox"
            aria-checked={isSingleUnit}
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") setIsSingleUnit((v) => !v); }}
          >
            <CardContent className="py-4 flex items-start gap-3">
              <div className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 mt-0.5 transition-colors",
                isSingleUnit ? "border-emerald-500 bg-emerald-500" : "border-border bg-background",
              )}>
                {isSingleUnit && <CheckCircle2 className="h-3.5 w-3.5 text-white" aria-hidden />}
              </div>
              <div>
                <p className={cn("text-sm font-semibold", isSingleUnit ? "text-emerald-800 dark:text-emerald-300" : "text-foreground")}>
                  This property is rented as a whole
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  For a house, villa, or commercial space rented to a single tenant or family.
                  Crib will manage it as one unit.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Single-unit details (shown when isSingleUnit) */}
          {isSingleUnit && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Home className="h-4 w-4" />
                  Unit Configuration
                </CardTitle>
                <CardDescription>Details for the whole-property unit (you can update rent after creation)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label>Bedrooms</Label>
                    <Input type="number" min={0} max={20} value={suBedrooms}
                      onChange={(e) => setSuBedrooms(parseInt(e.target.value) || 0)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Bathrooms</Label>
                    <Input type="number" min={0} max={20} value={suBathrooms}
                      onChange={(e) => setSuBathrooms(parseInt(e.target.value) || 0)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Sitting Rooms</Label>
                    <Input type="number" min={0} max={20} value={suSittingRooms}
                      onChange={(e) => setSuSittingRooms(parseInt(e.target.value) || 0)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Furnished Status</Label>
                    <Select value={suFurnished} onValueChange={(v) => setSuFurnished(v as FurnishedStatus)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FURNISHED_OPTIONS.map((f) => (
                          <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 flex flex-col justify-end">
                    <ToggleRow label="Self-contained (own bathroom + kitchen)" checked={suSelfContained} onChange={setSuSelfContained} />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border-dashed">
            <CardContent className="py-4 flex items-start gap-3">
              <Settings2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Default rules will be applied (5-day grace period, UGX 50,000 late fee, 2-month deposit).
                Customise them from the property&apos;s <strong>Rules</strong> page after creation.
              </p>
            </CardContent>
          </Card>

          <Separator />

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
            {isSingleUnit ? (
              <Button
                onClick={handleSubmit}
                disabled={!propName || !line1 || geocodeInvalid || isSubmitting}
              >
                {isSubmitting ? "Creating…" : "Create Property"}
                <CheckCircle2 className="h-4 w-4" aria-hidden />
              </Button>
            ) : (
              <Button
                onClick={() => setStep(2)}
                disabled={!propName || !line1 || geocodeInvalid}
              >
                Next: Configure Units
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── STEP 2: Unit generator ───────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Wand2 className="h-4 w-4" />
                Unit Generator
              </CardTitle>
              <CardDescription>
                Set defaults and auto-generate all units at once. Edit each unit in the preview below.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Naming */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Naming</p>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="genCount">Number of units *</Label>
                    <Input
                      id="genCount"
                      type="number"
                      min={1}
                      max={500}
                      value={genCount}
                      onChange={(e) => setGenCount(Math.min(parseInt(e.target.value) || 1, 500))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="genPrefix">Name prefix</Label>
                    <Input
                      id="genPrefix"
                      value={genPrefix}
                      onChange={(e) => setGenPrefix(e.target.value)}
                      placeholder="Unit / Room / Flat"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="genStart">Starting number</Label>
                    <Input
                      id="genStart"
                      type="number"
                      min={0}
                      value={genStartNum}
                      onChange={(e) => setGenStartNum(parseInt(e.target.value) || 1)}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Defaults */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Default values</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label>Type</Label>
                    <Select value={genType} onValueChange={(v) => setGenType(v as UnitType)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {UNIT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="genRent">Rent (UGX/mo)</Label>
                    <Input
                      id="genRent"
                      type="number"
                      min={0}
                      value={genRent}
                      onChange={(e) => setGenRent(parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Furnished</Label>
                    <Select value={genFurnished} onValueChange={(v) => setGenFurnished(v as FurnishedStatus)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FURNISHED_OPTIONS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="genBeds">Bedrooms</Label>
                    <Input
                      id="genBeds"
                      type="number"
                      min={0}
                      max={10}
                      value={genBeds}
                      onChange={(e) => setGenBeds(parseInt(e.target.value) || 1)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="genBaths">Bathrooms</Label>
                    <Input
                      id="genBaths"
                      type="number"
                      min={0}
                      max={10}
                      value={genBaths}
                      onChange={(e) => setGenBaths(parseInt(e.target.value) || 1)}
                    />
                  </div>
                  <div className="space-y-1.5 flex flex-col justify-end">
                    <ToggleRow label="Self-contained" checked={genSelfContained} onChange={setGenSelfContained} />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Floor assignment */}
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <input
                    type="checkbox"
                    id="genFloors"
                    checked={genFloors}
                    onChange={(e) => setGenFloors(e.target.checked)}
                    className="rounded"
                  />
                  <Label htmlFor="genFloors" className="cursor-pointer font-normal">
                    Auto-assign floor numbers
                  </Label>
                </div>
                {genFloors && (
                  <div className="grid grid-cols-2 gap-4 pl-6">
                    <div className="space-y-1.5">
                      <Label htmlFor="genUPF">Units per floor</Label>
                      <Input
                        id="genUPF"
                        type="number"
                        min={1}
                        value={genUPF}
                        onChange={(e) => setGenUPF(parseInt(e.target.value) || 1)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="genSF">Starting floor</Label>
                      <Input
                        id="genSF"
                        type="number"
                        min={0}
                        value={genStartFloor}
                        onChange={(e) => setGenStartFloor(parseInt(e.target.value))}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <Button type="button" onClick={handleGenerate} variant={generated ? "outline" : "default"}>
                  <Wand2 className="h-4 w-4" />
                  {generated ? "Re-generate" : "Generate Units"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Preview table */}
          {units.length > 0 && (
            <Card ref={tableRef as any}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Home className="h-4 w-4" />
                      Unit Preview
                      <Badge variant="secondary" className="ml-1">{units.length} units</Badge>
                    </CardTitle>
                    <CardDescription>
                      Review and edit each unit. Click any cell to change its value.
                    </CardDescription>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={addBlankUnit}>
                    <Plus className="h-3.5 w-3.5" />
                    Add unit
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-auto" style={{ maxHeight: "420px" }}>
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur border-b">
                      <tr>
                        <th className="py-2 pl-3 pr-2 text-left text-xs font-medium text-muted-foreground w-8">#</th>
                        <th className="py-2 px-2 text-left text-xs font-medium text-muted-foreground">Ref / Name</th>
                        <th className="py-2 px-2 text-left text-xs font-medium text-muted-foreground">Type</th>
                        <th className="py-2 px-2 text-right text-xs font-medium text-muted-foreground">Rent (UGX)</th>
                        <th className="py-2 px-2 text-center text-xs font-medium text-muted-foreground">Beds</th>
                        <th className="py-2 px-2 text-center text-xs font-medium text-muted-foreground">Baths</th>
                        <th className="py-2 px-2 text-center text-xs font-medium text-muted-foreground" title="Self-contained">SC</th>
                        <th className="py-2 px-2 text-left text-xs font-medium text-muted-foreground">Furnished</th>
                        <th className="py-2 px-2 text-center text-xs font-medium text-muted-foreground">Floor</th>
                        <th className="py-2 pr-3 pl-1 w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {units.map((unit, i) => (
                        <UnitRow
                          key={unit._key}
                          unit={unit}
                          index={i}
                          onChange={(patch) => updateUnit(unit._key, patch)}
                          onRemove={() => removeUnit(unit._key)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="border-t border-primary/15 px-4 py-2.5 flex items-center justify-between text-xs text-muted-foreground bg-primary/5">
                  <span>{units.length} units · avg rent UGX {Math.round(units.reduce((s, u) => s + u.monthlyRent, 0) / (units.length || 1)).toLocaleString()}/mo</span>
                  <span>Total monthly: UGX {units.reduce((s, u) => s + u.monthlyRent, 0).toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {generated && units.length === 0 && (
            <div className="rounded-[6px] border-2 border-dashed py-10 text-center text-sm text-muted-foreground">
              All units removed. Add units manually or re-generate.
            </div>
          )}

          <Separator />

          <div className="flex items-center justify-between gap-3">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>

            <div className="flex items-center gap-3">
              {units.length === 0 && (
                <p className="text-xs text-muted-foreground hidden sm:block">
                  No units configured — property will be created without units.
                </p>
              )}
              <Button
                onClick={handleSubmit}
                loading={isSubmitting}
                disabled={!generated && units.length === 0}
              >
                <CheckCircle2 className="h-4 w-4" />
                Create Property{units.length > 0 ? ` & ${units.length} Units` : ""}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
