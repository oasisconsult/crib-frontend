"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, MapPin, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateProperty } from "@/hooks/useProperties";

const PROPERTY_TYPES = [
  { value: "flat",       label: "Flat / Apartment" },
  { value: "house",      label: "House"             },
  { value: "hostel",     label: "Hostel / Lodge"    },
  { value: "commercial", label: "Commercial"        },
  { value: "villa",      label: "Villa"             },
];

const UG_CITIES = ["Kampala", "Entebbe", "Jinja", "Mbarara", "Gulu", "Mbale", "Kasese"];

export default function NewPropertyPage() {
  const router = useRouter();
  const { mutate: create, isPending } = useCreateProperty();

  // Basic info
  const [name, setName]   = useState("");
  const [type, setType]   = useState("flat");

  // Address
  const [line1, setLine1]     = useState("");
  const [city, setCity]       = useState("Kampala");
  const [state, setState]     = useState("Central Region");
  const [postcode, setPostcode] = useState("00256");

  // Unit count
  const [totalUnits, setTotalUnits] = useState(1);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !line1) return;

    create(
      {
        name,
        type: type as "flat",
        status: "active",
        address: { line1, city, state, postcode, country: "Uganda" },
        rules: {
          gracePeriodDays: 5,
          lateFeeType: "flat",
          lateFeeValue: 50000,
          depositMonths: 2,
          noticePeriodDays: 30,
          allowSubletting: false,
          allowPets: false,
          allowSmoking: false,
          rentDayOfMonth: 1,
          billingCurrency: "UGX",
          maintenanceWindowHours: 24,
        },
        landlordId: "landlord-1",
        totalUnits,
        occupiedUnits: 0,
        occupancyRate: 0,
        monthlyRevenue: 0,
        currency: "UGX",
        tags: [],
        amenities: [],
      },
      { onSuccess: () => router.push("/properties") },
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Add Property</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Register a new property in your portfolio</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* ── Basic details ─────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Property Details
            </CardTitle>
            <CardDescription>Name, type, and unit count</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Property Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Kololo Heights Apartments"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="type">Property Type *</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger id="type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROPERTY_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="units">Number of Units *</Label>
                <Input
                  id="units"
                  type="number"
                  min={1}
                  value={totalUnits}
                  onChange={(e) => setTotalUnits(parseInt(e.target.value) || 1)}
                  required
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Address ───────────────────────────────────── */}
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
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="city">City *</Label>
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
                <Label htmlFor="state">Region</Label>
                <Input
                  id="state"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="e.g. Central Region"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Default rules note ────────────────────────── */}
        <Card className="border-dashed">
          <CardContent className="py-4 flex items-start gap-3">
            <Settings2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Default rules will be applied (5-day grace period, UGX 50,000 late fee, 2-month deposit).
              You can customise them from the property&apos;s <strong>Rules</strong> page after creation.
            </p>
          </CardContent>
        </Card>

        <Separator />

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" loading={isPending} disabled={!name || !line1}>
            Create Property
          </Button>
        </div>
      </form>
    </div>
  );
}
