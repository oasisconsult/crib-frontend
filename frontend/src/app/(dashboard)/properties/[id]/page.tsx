"use client";

import { use, useState } from "react";
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
import { useProperty, useUpdateProperty } from "@/hooks/useProperties";
import { uploadsApi } from "@/services/api/uploads";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/utils/cn";
import type { Property, PropertyType, PropertyStatus } from "@/types";

interface Props {
  params: Promise<{ id: string }>;
}

const PROPERTY_TYPES: { value: PropertyType; label: string }[] = [
  { value: "flat",       label: "Flat / Apartment" },
  { value: "house",      label: "House"             },
  { value: "hostel",     label: "Hostel / Lodge"    },
  { value: "commercial", label: "Commercial"        },
  { value: "villa",      label: "Villa"             },
];

const STATUS_OPTIONS: { value: PropertyStatus; label: string }[] = [
  { value: "active",      label: "Active"      },
  { value: "inactive",    label: "Inactive"    },
  { value: "maintenance", label: "Maintenance" },
];

const UG_CITIES = ["Kampala", "Entebbe", "Jinja", "Mbarara", "Gulu", "Mbale", "Kasese"];

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
          ? "border-teal-600 dark:border-teal-500 bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-400 font-semibold"
          : "border-border bg-muted/30 text-muted-foreground hover:border-primary/50",
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

  const [name,        setName]        = useState(property.name);
  const [type,        setType]        = useState<PropertyType>(property.type);
  const [status,      setStatus]      = useState<PropertyStatus>(property.status);
  const [description, setDescription] = useState(property.description ?? "");
  // Address
  const [line1,    setLine1]    = useState(property.address.line1);
  const [city,     setCity]     = useState(property.address.city);
  const [region,   setRegion]   = useState(property.address.state);
  const [postcode, setPostcode] = useState(property.address.postcode ?? "");
  // Amenities & tags
  const [amenities, setAmenities] = useState<string[]>(property.amenities ?? []);
  const [tagsInput, setTagsInput] = useState((property.tags ?? []).join(", "));

  function toggleAmenity(a: string) {
    setAmenities((prev) =>
      prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a],
    );
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
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
          },
          amenities,
          tags,
        },
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
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="city">City</Label>
              <Select value={city} onValueChange={setCity}>
                <SelectTrigger id="city"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UG_CITIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
        <Button type="submit" loading={isPending}>
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

export default function PropertyDetailPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const { data: property, isLoading } = useProperty(id);
  const { can } = usePermissions();
  const canEdit = can("properties:write");
  const [editing, setEditing] = useState(false);

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
              { label: "Occupied",     value: property.occupiedUnits,                          color: "text-teal-600 dark:text-teal-400"                   },
              { label: "Vacant",       value: property.totalUnits - property.occupiedUnits,    color: "text-amber-600 dark:text-amber-400"                       },
              { label: "Occupancy",    value: `${occupancyRate}%`,                             color: occupancyRate >= 80 ? "text-teal-600 dark:text-teal-400" : "text-amber-600" },
            ].map((stat) => (
              <Card key={stat.label}>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

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
                  <span className={cn("font-semibold", occupancyRate >= 80 ? "text-teal-600 dark:text-teal-400" : "text-amber-600")}>
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
    </div>
  );
}
