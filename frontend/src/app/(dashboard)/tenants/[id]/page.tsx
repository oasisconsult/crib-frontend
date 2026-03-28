"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Mail,
  Phone,
  Shield,
  Edit,
  X,
  Save,
  User,
  Tag,
  StickyNote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { OnboardingProgress } from "@/components/tenants/OnboardingProgress";
import { TenantDocumentsSection } from "@/components/tenants/TenantDocumentsSection";
import { PageSkeleton } from "@/components/common/LoadingSkeleton";
import { formatDate, getInitials } from "@/utils/formatters";
import { useTenant, useUpdateTenant } from "@/hooks/useTenants";
import { usePermissions } from "@/hooks/usePermissions";
import type { Tenant, TenantStatus } from "@/types";

interface Props {
  params: Promise<{ id: string }>;
}

const STATUS_OPTIONS: { value: TenantStatus; label: string }[] = [
  { value: "active",      label: "Active"      },
  { value: "inactive",    label: "Inactive"    },
  { value: "blacklisted", label: "Blacklisted" },
];

function EditForm({
  tenant,
  onCancel,
}: {
  tenant: Tenant;
  onCancel: () => void;
}) {
  const { mutate: update, isPending } = useUpdateTenant();

  const [firstName,   setFirstName]   = useState(tenant.firstName);
  const [lastName,    setLastName]    = useState(tenant.lastName);
  const [phone,       setPhone]       = useState(tenant.phone ?? "");
  const [nationality, setNationality] = useState(tenant.nationality ?? "");
  const [status,      setStatus]      = useState<TenantStatus>(tenant.status);
  const [notes,       setNotes]       = useState(tenant.notes ?? "");
  // Emergency contact
  const [ecName,         setEcName]         = useState(tenant.emergencyContact?.name ?? "");
  const [ecRelationship, setEcRelationship] = useState(tenant.emergencyContact?.relationship ?? "");
  const [ecPhone,        setEcPhone]        = useState(tenant.emergencyContact?.phone ?? "");

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const patch: Partial<Tenant> = {
      firstName,
      lastName,
      phone,
      nationality: nationality || undefined,
      status,
      notes: notes || undefined,
      emergencyContact: ecName
        ? { name: ecName, relationship: ecRelationship, phone: ecPhone }
        : undefined,
    };
    update({ id: tenant.id, data: patch }, { onSuccess: onCancel });
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* ── Personal details ────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4" />
            Personal Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">First Name *</Label>
              <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Last Name *</Label>
              <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+256 700 000000" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nationality">Nationality</Label>
              <Input id="nationality" value={nationality} onChange={(e) => setNationality(e.target.value)} placeholder="e.g. Ugandan" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="status">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as TenantStatus)}>
              <SelectTrigger id="status"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* ── Emergency contact ───────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Emergency Contact
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="ecName">Name</Label>
              <Input id="ecName" value={ecName} onChange={(e) => setEcName(e.target.value)} placeholder="e.g. Sarah Namukasa" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ecRelationship">Relationship</Label>
              <Input id="ecRelationship" value={ecRelationship} onChange={(e) => setEcRelationship(e.target.value)} placeholder="e.g. Spouse" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ecPhone">Phone</Label>
            <Input id="ecPhone" value={ecPhone} onChange={(e) => setEcPhone(e.target.value)} placeholder="+256 700 000000" />
          </div>
        </CardContent>
      </Card>

      {/* ── Notes ───────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <StickyNote className="h-4 w-4" />
            Notes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Internal notes visible only to landlords and managers..."
            rows={4}
          />
        </CardContent>
      </Card>

      {/* ── Actions ─────────────────────────────── */}
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

// ── Tenant notes (internal, staff-only) ──────────────────────────────────────

function TenantNotesSection({ tenant }: { tenant: Tenant }) {
  const { mutate: update, isPending } = useUpdateTenant();
  const [notes, setNotes] = useState<string[]>(
    tenant.notes ? tenant.notes.split("\n---\n").filter(Boolean) : [],
  );
  const [draft, setDraft] = useState("");

  function addNote() {
    const text = draft.trim();
    if (!text) return;
    const ts = new Date().toLocaleString("en-UG", { dateStyle: "medium", timeStyle: "short" });
    const entry = `[${ts}] ${text}`;
    const next = [...notes, entry];
    setNotes(next);
    setDraft("");
    update({ id: tenant.id, data: { notes: next.join("\n---\n") } });
  }

  function removeNote(i: number) {
    const next = notes.filter((_, idx) => idx !== i);
    setNotes(next);
    update({ id: tenant.id, data: { notes: next.join("\n---\n") } });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <StickyNote className="h-4 w-4" />
          Internal Notes
          <span className="text-xs font-normal text-muted-foreground">— visible to staff only</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {notes.length > 0 && (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {notes.map((note, i) => {
              const match = note.match(/^\[(.+?)\] (.+)$/s);
              const ts   = match?.[1] ?? "";
              const text = match?.[2] ?? note;
              return (
                <div key={i} className="group flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    {ts && <p className="text-[11px] text-muted-foreground mb-0.5">{ts}</p>}
                    <p className="text-sm leading-snug whitespace-pre-wrap">{text}</p>
                  </div>
                  <button
                    onClick={() => removeNote(i)}
                    className="hidden group-hover:block shrink-0 text-muted-foreground hover:text-destructive transition-colors mt-0.5"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addNote();
            }}
            placeholder="Add a note… (⌘Enter to save)"
            rows={2}
            className="resize-none text-sm flex-1"
          />
          <Button
            size="sm"
            className="self-end"
            disabled={!draft.trim() || isPending}
            onClick={addNote}
          >
            {isPending ? <Save className="h-3.5 w-3.5 animate-pulse" /> : <Save className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function TenantDetailPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const { data: tenant, isLoading } = useTenant(id);
  const { can } = usePermissions();
  const canEdit = can("tenants:write");

  const [editing, setEditing] = useState(false);

  if (isLoading) return <PageSkeleton />;
  if (!tenant) return null;

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-3 flex-1">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-primary/10 text-primary font-medium">
              {getInitials(`${tenant.firstName} ${tenant.lastName}`)}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              {tenant.firstName} {tenant.lastName}
            </h1>
            <p className="text-sm text-muted-foreground">{tenant.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={
              tenant.onboardingState === "approved" || tenant.onboardingState === "activated"
                ? "success"
                : tenant.onboardingState === "rejected"
                  ? "destructive"
                  : "secondary"
            }
            className="capitalize"
          >
            {tenant.onboardingState.replace(/_/g, " ")}
          </Badge>
          {canEdit && !editing && (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Edit className="h-3.5 w-3.5" />
              Edit
            </Button>
          )}
        </div>
      </div>

      {/* ── Edit form (replaces read view when editing) ── */}
      {editing ? (
        <EditForm tenant={tenant} onCancel={() => setEditing(false)} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Contact */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Contact Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <a href={`mailto:${tenant.email}`} className="hover:underline">
                    {tenant.email}
                  </a>
                </div>
                {tenant.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a href={`tel:${tenant.phone}`} className="hover:underline">
                      {tenant.phone}
                    </a>
                  </div>
                )}
                {tenant.nationality && (
                  <>
                    <Separator />
                    <div className="flex items-center gap-2 text-sm">
                      <Shield className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Nationality:</span>
                      <span>{tenant.nationality}</span>
                    </div>
                  </>
                )}
                {tenant.status && (
                  <>
                    <Separator />
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Status</span>
                      <Badge
                        variant={
                          tenant.status === "active"
                            ? "success"
                            : tenant.status === "blacklisted"
                              ? "destructive"
                              : "outline"
                        }
                        className="capitalize"
                      >
                        {tenant.status}
                      </Badge>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Emergency contact */}
            {tenant.emergencyContact && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Emergency Contact</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Name</span>
                    <span>{tenant.emergencyContact.name}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Relationship</span>
                    <span className="capitalize">{tenant.emergencyContact.relationship}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Phone</span>
                    <span>{tenant.emergencyContact.phone}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Notes (visible to landlord/manager/superadmin only) */}
            {canEdit && <TenantNotesSection tenant={tenant} />}

            {/* Documents */}
            <TenantDocumentsSection tenantId={id} />
          </div>

          {/* ── Sidebar ─────────────────────────────── */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Onboarding Progress</CardTitle>
              </CardHeader>
              <CardContent>
                <OnboardingProgress state={tenant.onboardingState} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Account</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Joined</span>
                  <span>{formatDate(tenant.createdAt)}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tenant ID</span>
                  <span className="font-mono text-xs">{tenant.id.slice(-8)}</span>
                </div>
                {tenant.tags.length > 0 && (
                  <>
                    <Separator />
                    <div className="flex flex-wrap gap-1 pt-1">
                      {tenant.tags.map((t) => (
                        <Badge key={t} variant="secondary" className="text-xs gap-1">
                          <Tag className="h-2.5 w-2.5" />
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
