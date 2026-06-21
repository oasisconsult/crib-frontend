"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Home,
  Settings,
  ClipboardList,
  Edit,
  X,
  Save,
  MapPin,
  Tag,
  Wifi,
  Camera,
  ImageIcon,
  Trash2,
  Loader2,
  CheckCircle2,
  ShieldCheck,
  ExternalLink,
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
import { formatCurrency } from "@/utils/formatters";
import { useProperty, useUpdateProperty, useDeleteProperty } from "@/hooks/useProperties";
import { LocationSearch } from "@/components/ui/location-search";
import { GeocodeField } from "@/components/ui/geocode-field";
import { settingsApi } from "@/services/api/settings";
import { uploadsApi } from "@/services/api/uploads";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "@/store/useUIStore";
import { cn } from "@/utils/cn";
import type { Property, PropertyType, PropertyStatus, WaterSource, BackupPower, InternetType, CompoundType } from "@/types";
import { PermissionGate } from "@/components/common/PermissionGate";

interface Props {
  params: Promise<{ id: string }>;
}

const GEOCODE_RE = /^[A-Z0-9]+-[A-Z0-9]+$/; // used for submit validation

const PROPERTY_TYPES: { value: PropertyType; label: string }[] = [
  { value: "flat",            label: "Flat / Apartment"       },
  { value: "house",           label: "House"                  },
  { value: "bungalow",        label: "Bungalow"               },
  { value: "maisonette",      label: "Maisonette"             },
  { value: "townhouse",       label: "Townhouse"              },
  { value: "villa",           label: "Villa"                  },
  { value: "bedsitter_block", label: "Bedsitter Block / Lodge"},
  { value: "hostel",          label: "Hostel"                 },
  { value: "commercial",      label: "Commercial"             },
];

const WATER_SOURCE_OPTIONS: { value: WaterSource; label: string }[] = [
  { value: "municipal", label: "NWSC / Municipal" },
  { value: "borehole",  label: "Borehole"         },
  { value: "tank",      label: "Water Tank"       },
  { value: "multiple",  label: "Multiple Sources" },
];

const BACKUP_POWER_OPTIONS: { value: BackupPower; label: string }[] = [
  { value: "none",      label: "None"              },
  { value: "solar",     label: "Solar"             },
  { value: "generator", label: "Generator"         },
  { value: "both",      label: "Solar + Generator" },
];

const INTERNET_TYPE_OPTIONS: { value: InternetType; label: string }[] = [
  { value: "none",  label: "None"  },
  { value: "wifi",  label: "Wi-Fi" },
  { value: "fibre", label: "Fibre" },
];

const COMPOUND_TYPE_OPTIONS: { value: CompoundType; label: string }[] = [
  { value: "private", label: "Private Compound" },
  { value: "shared",  label: "Shared Compound"  },
];

const STATUS_OPTIONS: { value: PropertyStatus; label: string }[] = [
  { value: "active",      label: "Active"      },
  { value: "inactive",    label: "Inactive"    },
  { value: "maintenance", label: "Maintenance" },
];

const COMMON_AMENITIES = [
  "WiFi", "Parking", "CCTV", "Generator", "Water Tank", "Lift",
  "Security", "Gym", "Swimming Pool", "Laundry", "Garden",
];

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
          ? "border-emerald-600 dark:border-emerald-500 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-semibold"
          : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:bg-[hsl(var(--accent))]",
      )}
    >
      {label}
    </button>
  );
}

function EditForm({
  property,
  onCancel,
}: {
  property: Property;
  onCancel: () => void;
}) {
  const { mutate: update, isPending } = useUpdateProperty();

  const [name,          setName]          = useState(property.name);
  const [type,          setType]          = useState<PropertyType>(property.type);
  const [status,        setStatus]        = useState<PropertyStatus>(property.status);
  const [description,   setDescription]   = useState(property.description ?? "");
  const [isSingleUnit,  setIsSingleUnit]  = useState(property.isSingleUnit ?? false);
  // Uganda property features
  const [totalFloors,        setTotalFloors]        = useState(property.totalFloors ?? 1);
  const [yearBuilt,          setYearBuilt]          = useState(property.yearBuilt ? String(property.yearBuilt) : "");
  const [landSizeAcres,      setLandSizeAcres]      = useState(property.landSizeAcres ? String(property.landSizeAcres) : "");
  const [waterSource,        setWaterSource]        = useState<WaterSource>(property.waterSource ?? "municipal");
  const [backupPower,        setBackupPower]        = useState<BackupPower>(property.backupPower ?? "none");
  const [internetType,       setInternetType]       = useState<InternetType>(property.internetType ?? "none");
  const [compoundType,       setCompoundType]       = useState<CompoundType>(property.compoundType ?? "private");
  const [hasPerimeterWall,   setHasPerimeterWall]   = useState(property.hasPerimeterWall ?? false);
  const [hasGate,            setHasGate]            = useState(property.hasGate ?? false);
  const [hasGuard,           setHasGuard]           = useState(property.hasGuard ?? false);
  const [hasCctv,            setHasCctv]            = useState(property.hasCctv ?? false);
  const [totalParkingSpaces, setTotalParkingSpaces] = useState(property.totalParkingSpaces ?? 0);
  // Address
  const [line1,     setLine1]     = useState(property.address.line1);
  const [city,      setCity]      = useState(property.address.city);
  const [region,    setRegion]    = useState(property.address.state);
  const [postcode,  setPostcode]  = useState(property.address.postcode ?? "");
  const [geocode,   setGeocode]   = useState(property.geocode ?? "");
  // GeoBox admin hierarchy — autofilled from village search or geocode lookup
  const [village,   setVillage]   = useState(property.address.village   ?? "");
  const [parish,    setParish]    = useState(property.address.parish    ?? "");
  const [subCounty, setSubCounty] = useState(property.address.subCounty ?? "");
  const [county,    setCounty]    = useState(property.address.county    ?? "");
  const [district,  setDistrict]  = useState(property.address.district  ?? "");
  const [geoboxSettings, setGeoboxSettings] = useState<Record<string, string>>({});

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

  // Amenities & tags
  const [amenities, setAmenities] = useState<string[]>(property.amenities ?? []);
  const [tagsInput, setTagsInput] = useState((property.tags ?? []).join(", "));

  const geocodeInvalid = geocode ? !GEOCODE_RE.test(geocode) : false;

  function toggleAmenity(a: string) {
    setAmenities((prev) =>
      prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a],
    );
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (geocodeInvalid) return;
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    update(
      {
        id: property.id,
        data: {
          name,
          type,
          status,
          description: description || undefined,
          address: {
            ...property.address,
            line1,
            city,
            state: region,
            postcode,
            village:   village   || undefined,
            parish:    parish    || undefined,
            subCounty: subCounty || undefined,
            county:    county    || undefined,
            district:  district  || undefined,
          },
          geocode: geocode || undefined,
          amenities,
          tags,
          isSingleUnit,
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
        } as any,
      },
      { onSuccess: onCancel },
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-4 max-w-2xl">
      {/* ── Basic info ────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Property Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Property Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="type">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as PropertyType)}>
                <SelectTrigger id="type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROPERTY_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="status">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as PropertyStatus)}>
                <SelectTrigger id="status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the property..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Whole-property toggle ── */}
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
            isSingleUnit
              ? "border-emerald-500 bg-emerald-500"
              : "border-border bg-background",
          )}>
            {isSingleUnit && <CheckCircle2 className="h-3.5 w-3.5 text-white" aria-hidden />}
          </div>
          <div>
            <p className={cn(
              "text-sm font-semibold",
              isSingleUnit ? "text-emerald-800 dark:text-emerald-300" : "text-foreground",
            )}>
              This property is rented as a whole
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              Enabling this on a property with no units will create a single virtual unit so you can create a lease for the entire property.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Address ───────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Address
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="line1">Street / Plot *</Label>
            <Input
              id="line1"
              value={line1}
              onChange={(e) => setLine1(e.target.value)}
              required
            />
          </div>
          {/* GeoBox Geocode — look up to auto-fill hierarchy, or create one on GeoBox */}
          <div className="space-y-1.5">
            <Label htmlFor="geocode">GeoBox Geocode</Label>
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
          {/* Village / Area search — selecting from GeoBox results also fills hierarchy */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="city">Village / Area</Label>
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
              <Input
                id="region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
              />
            </div>
          </div>
          {/* Admin hierarchy — auto-filled from GeoBox; editable */}
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

      {/* ── Amenities ─────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Wifi className="h-4 w-4" />
            Amenities
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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

      {/* ── Property Features ─────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Property Features
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Structure */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="totalFloors">Floors</Label>
              <Input
                id="totalFloors"
                type="number"
                min={0}
                max={200}
                value={totalFloors}
                onChange={(e) => setTotalFloors(parseInt(e.target.value) || 0)}
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
              <Label htmlFor="landSize">Land (acres) <span className="text-muted-foreground text-xs">(optional)</span></Label>
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
                  {WATER_SOURCE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Backup Power</Label>
              <Select value={backupPower} onValueChange={(v) => setBackupPower(v as BackupPower)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BACKUP_POWER_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Internet</Label>
              <Select value={internetType} onValueChange={(v) => setInternetType(v as InternetType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INTERNET_TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Compound</Label>
              <Select value={compoundType} onValueChange={(v) => setCompoundType(v as CompoundType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COMPOUND_TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* Security */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Security &amp; Access</p>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {[
                { label: "Perimeter Wall", value: hasPerimeterWall, set: setHasPerimeterWall },
                { label: "Gate",           value: hasGate,          set: setHasGate          },
                { label: "Guard / Watchman", value: hasGuard,       set: setHasGuard         },
                { label: "CCTV",           value: hasCctv,          set: setHasCctv          },
              ].map(({ label, value, set }) => (
                <label key={label} className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={(e) => set(e.target.checked)}
                    className="rounded border-border"
                  />
                  {label}
                </label>
              ))}
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

      {/* ── Tags ──────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Tags
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="e.g. premium, kololo, furnished (comma-separated)"
          />
          <p className="text-xs text-muted-foreground mt-1.5">Separate tags with commas</p>
        </CardContent>
      </Card>

      <Separator />

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          <X className="h-4 w-4" />
          Cancel
        </Button>
        <Button type="submit" loading={isPending} disabled={geocodeInvalid}>
          <Save className="h-4 w-4" />
          Save Changes
        </Button>
      </div>
    </form>
  );
}

// ── Photo gallery ─────────────────────────────────────────────────────────────

function PropertyPhotos({
  property,
  canEdit,
}: {
  property: Property;
  canEdit: boolean;
}) {
  const { mutate: update } = useUpdateProperty();
  const [photos, setPhotos] = useState<string[]>(property.images ?? []);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    e.target.value = "";
    setUploading(true);
    try {
      const results = await Promise.all(
        files.map((f) => uploadsApi.uploadFile(f, { category: "property_image" })),
      );
      const newUrls = results.map((r) => r.url);
      const next = [...photos, ...newUrls];
      setPhotos(next);
      update(
        { id: property.id, data: { images: next } },
        { onSettled: () => setUploading(false) },
      );
    } catch {
      setUploading(false);
    }
  }

  function remove(url: string) {
    const next = photos.filter((p) => p !== url);
    setPhotos(next);
    update({ id: property.id, data: { images: next } });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Camera className="h-4 w-4" />
            Photos
            {photos.length > 0 && (
              <span className="text-xs font-normal text-muted-foreground">({photos.length})</span>
            )}
          </CardTitle>
          {canEdit && (
            <label className="cursor-pointer">
              <input type="file" accept="image/*" multiple className="sr-only" onChange={handleFiles} disabled={uploading} />
              <span className="inline-flex items-center gap-1.5 rounded-[5px] border border-input bg-background px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-accent transition-colors">
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                {uploading ? "Saving…" : "Add Photos"}
              </span>
            </label>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {photos.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
            <ImageIcon className="h-8 w-8 opacity-30" />
            <p className="text-sm">No photos uploaded yet</p>
            {canEdit && (
              <label className="cursor-pointer text-xs text-primary underline-offset-2 hover:underline">
                <input type="file" accept="image/*" multiple className="sr-only" onChange={handleFiles} />
                Upload the first photo
              </label>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {photos.map((url, i) => (
              <div key={url} className="group relative aspect-square rounded-[6px] overflow-hidden border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Photo ${i + 1}`} className="h-full w-full object-cover cursor-pointer" onClick={() => setLightbox(url)} />
                {canEdit && (
                  <button
                    onClick={() => remove(url)}
                    className="absolute top-1 right-1 hidden group-hover:flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Full size" className="max-h-[90vh] max-w-[90vw] rounded-[6px] shadow-2xl object-contain" onClick={(e) => e.stopPropagation()} />
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </Card>
  );
}

function OwnerCard({ property, onNavigate }: { property: Property; onNavigate: (path: string) => void }) {
  const href = property.isAgency
    ? `/admin/agencies/${property.landlordId}`
    : property.ownerProfileId
      ? `/admin/landlords/${property.ownerProfileId}`
      : null;

  return (
    <Card
      className={cn(
        "border-dashed transition-colors",
        href ? "cursor-pointer hover:border-primary/50 hover:bg-primary/[0.02]" : "",
      )}
      onClick={href ? () => onNavigate(href) : undefined}
    >
      <CardContent className="py-3 px-4 flex items-center gap-3">
        <div className={cn(
          "h-8 w-8 rounded-[6px] flex items-center justify-center shrink-0",
          property.isAgency
            ? "bg-violet-100 dark:bg-violet-950/30"
            : "bg-emerald-100 dark:bg-emerald-950/30",
        )}>
          <Building2 className={cn(
            "h-4 w-4",
            property.isAgency ? "text-violet-600" : "text-emerald-600",
          )} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate">{property.orgName ?? "Unknown Organisation"}</p>
            <Badge
              variant="outline"
              className={cn(
                "text-xs shrink-0",
                property.isAgency
                  ? "text-violet-700 border-violet-300 bg-violet-50 dark:bg-violet-950/20 dark:text-violet-300"
                  : "text-emerald-700 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 dark:text-emerald-300",
              )}
            >
              {property.isAgency ? "Agency" : "Independent Owner"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">Owning organisation</p>
        </div>
        {href && <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />}
      </CardContent>
    </Card>
  );
}

export default function PropertyDetailPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const { data: property, isLoading } = useProperty(id);
  const { can, canDo } = usePermissions();
  const canEdit = can("properties:write");
  // Delete/archive is a separate, higher-privilege action controlled by Access Control
  const canDelete = canDo("delete", "property");
  const [editing, setEditing] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const { mutate: archiveProperty, isPending: archiving } = useDeleteProperty();

  if (isLoading) return <PageSkeleton />;
  if (!property) return null;

  const occupancyRate =
    property.totalUnits > 0
      ? Math.round((property.occupiedUnits / property.totalUnits) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight truncate">{property.name}</h1>
          <p className="text-sm text-muted-foreground">
            {property.address.line1}, {property.address.city}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canEdit && !editing && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Edit className="h-3.5 w-3.5" />
              Edit
            </Button>
          )}
          {canDelete && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => setConfirmArchive(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Archive
            </Button>
          )}
          <Button variant="outline" onClick={() => router.push(`/properties/${id}/rules`)}>
            <Settings className="h-4 w-4" />
            Rules
          </Button>
          <Button onClick={() => router.push(`/properties/${id}/units`)}>
            <Home className="h-4 w-4" />
            Units
          </Button>
        </div>
      </div>

      {editing ? (
        <EditForm property={property} onCancel={() => setEditing(false)} />
      ) : (
        <>
          {/* ── Stats ──────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Total Units",  value: property.totalUnits,                             color: "text-foreground"                                          },
              { label: "Occupied",     value: property.occupiedUnits,                          color: "text-emerald-600 dark:text-emerald-400"                   },
              { label: "Vacant",       value: property.totalUnits - property.occupiedUnits,    color: "text-amber-600 dark:text-amber-400"                       },
              { label: "Occupancy",    value: `${occupancyRate}%`,                             color: occupancyRate >= 80 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600" },
            ].map((stat) => (
              <Card key={stat.label}>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* ── Owner (superadmin only) ───────────── */}
          <PermissionGate role="superadmin">
            <OwnerCard property={property} onNavigate={router.push} />
          </PermissionGate>

          {/* ── Details + financials ──────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Property Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type</span>
                  <Badge variant="secondary" className="capitalize">
                    {property.type.replace(/_/g, " ")}
                  </Badge>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge
                    variant={
                      property.status === "active"
                        ? "success"
                        : property.status === "maintenance"
                          ? "warning"
                          : "outline"
                    }
                    className="capitalize"
                  >
                    {property.status}
                  </Badge>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Address</span>
                  <span className="text-right max-w-[60%]">
                    {property.address.line1}, {property.address.city}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Country</span>
                  <span>{property.address.country}</span>
                </div>
                {property.address.postcode && (
                  <>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Postcode</span>
                      <span>{property.address.postcode}</span>
                    </div>
                  </>
                )}
                {property.geocode && (
                  <>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Geocode</span>
                      <code className="font-mono text-sm tracking-wider">{property.geocode}</code>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Financial Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Monthly Revenue</span>
                  <span className="font-semibold">
                    {formatCurrency(property.monthlyRevenue, "UGX")}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Currency</span>
                  <span>{property.currency}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Occupancy Rate</span>
                  <span className={cn("font-semibold", occupancyRate >= 80 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600")}>
                    {occupancyRate}%
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Amenities ─────────────────────────── */}
          {property.amenities?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Amenities</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {property.amenities.map((a) => (
                    <span
                      key={a}
                      className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium bg-muted/40"
                    >
                      {a}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Tags ──────────────────────────────── */}
          {property.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {property.tags.map((t) => (
                <Badge key={t} variant="secondary" className="text-xs capitalize">
                  {t}
                </Badge>
              ))}
            </div>
          )}

          {/* ── Description ───────────────────────── */}
          {property.description && (
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-sm text-muted-foreground leading-relaxed">{property.description}</p>
              </CardContent>
            </Card>
          )}

          {/* ── Photos ────────────────────────────── */}
          <PropertyPhotos property={property} canEdit={canEdit} />

          {/* ── Quick actions ─────────────────────── */}
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => router.push(`/properties/${id}/units`)}>
              <Home className="h-4 w-4" />
              Manage Units
            </Button>
            <Button variant="outline" onClick={() => router.push(`/inspections?propertyId=${id}`)}>
              <ClipboardList className="h-4 w-4" />
              Inspections
            </Button>
          </div>
        </>
      )}

      {/* ── Archive confirmation modal ── */}
      {confirmArchive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card border rounded-[10px] shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-base font-semibold">Archive Property?</h2>
            <p className="text-sm text-muted-foreground">
              <strong>{property.name}</strong> will be archived and hidden from the dashboard.
              All units will be archived too. No data is deleted — a superadmin can restore it later.
              <br /><br />
              This is blocked if any unit is occupied, has an active lease, or has an active inspection.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setConfirmArchive(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                loading={archiving}
                onClick={() =>
                  archiveProperty(id, {
                    onSuccess: () => {
                      setConfirmArchive(false);
                      router.push("/properties");
                    },
                    onError: (err: unknown) => {
                      const msg = (err as { data?: { detail?: string } })?.data?.detail
                        ?? "Failed to archive property.";
                      setConfirmArchive(false);
                      toast.error(msg);
                    },
                  })
                }
              >
                Archive property
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
