"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCreateInspection } from "@/hooks/useInspections";
import { useProperties, useUnits } from "@/hooks/useProperties";

const INSPECTION_TYPES = [
  { value: "routine", label: "Routine" },
  { value: "move_in", label: "Move-in" },
  { value: "move_out", label: "Move-out" },
  { value: "maintenance", label: "Maintenance" },
  { value: "complaint", label: "Complaint" },
];

const DEFAULT_CHECKLIST = [
  { id: "cl-1", area: "Living Room", description: "General condition", condition: null, notes: "", photoUrls: [], required: true },
  { id: "cl-2", area: "Kitchen", description: "Appliances and fixtures", condition: null, notes: "", photoUrls: [], required: true },
  { id: "cl-3", area: "Bathroom", description: "Fixtures and fittings", condition: null, notes: "", photoUrls: [], required: true },
  { id: "cl-4", area: "Bedroom(s)", description: "Walls, floor, windows", condition: null, notes: "", photoUrls: [], required: true },
  { id: "cl-5", area: "Exterior", description: "Entry, compound, drainage", condition: null, notes: "", photoUrls: [], required: false },
];

export default function NewInspectionPage() {
  const router = useRouter();
  const { mutate: create, isPending } = useCreateInspection();
  const { data: propertiesData } = useProperties();
  const properties = propertiesData?.data ?? [];
  const { data: unitsData } = useUnits(propertyId);
  const units = unitsData?.data ?? [];

  const [propertyId, setPropertyId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [type, setType] = useState("routine");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTimeSlot, setScheduledTimeSlot] = useState("");
  const [inspectorName, setInspectorName] = useState("");
  const [notes, setNotes] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!propertyId || !scheduledDate) return;

    create(
      {
        type: type as "routine",
        propertyId,
        unitId: unitId || undefined,
        landlordId: "landlord-1",
        scheduledDate,
        scheduledTimeSlot: scheduledTimeSlot || undefined,
        inspectorName: inspectorName || undefined,
        checklist: DEFAULT_CHECKLIST,
        photoUrls: [],
        videoUrls: [],
        maintenanceIssueIds: [],
        summary: notes || undefined,
      },
      { onSuccess: () => router.push("/inspections") },
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Schedule Inspection</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Book a property or unit inspection</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              Inspection Details
            </CardTitle>
            <CardDescription>Location, type, and schedule</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="property">Property *</Label>
                <Select value={propertyId} onValueChange={(v) => { setPropertyId(v); setUnitId(""); }} required>
                  <SelectTrigger id="property">
                    <SelectValue placeholder="Select property" />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="unit">Unit (optional)</Label>
                <Select value={unitId} onValueChange={setUnitId} disabled={!propertyId || units.length === 0}>
                  <SelectTrigger id="unit">
                    <SelectValue placeholder={propertyId ? (units.length === 0 ? "No units found" : "Whole property") : "Select property first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name ?? `Unit #${u.id.slice(-4)}`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="type">Inspection Type *</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger id="type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INSPECTION_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="inspector">Inspector Name</Label>
                <Input
                  id="inspector"
                  value={inspectorName}
                  onChange={(e) => setInspectorName(e.target.value)}
                  placeholder="e.g. John Mugisha"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="date">Scheduled Date *</Label>
                <Input
                  id="date"
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="timeslot">Time Slot</Label>
                <Input
                  id="timeslot"
                  value={scheduledTimeSlot}
                  onChange={(e) => setScheduledTimeSlot(e.target.value)}
                  placeholder="e.g. 10:00 – 12:00"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Access instructions, special requirements..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" loading={isPending} disabled={!propertyId || !scheduledDate}>
            Schedule Inspection
          </Button>
        </div>
      </form>
    </div>
  );
}
