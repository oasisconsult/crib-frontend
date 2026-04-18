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
  CheckCircle,
  XCircle,
  RefreshCw,
  Copy,
  ExternalLink,
  Fingerprint,
  MessageCircle,
  Banknote,
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
import { useTenant, useUpdateTenant, useApproveOnboarding, useRejectOnboarding, useResendInvite } from "@/hooks/useTenants";
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
  // Identity & payment
  const [nin,                  setNin]                  = useState(tenant.nin ?? "");
  const [whatsappNumber,       setWhatsappNumber]       = useState(tenant.whatsappNumber ?? "");
  const [mobileMoneyProvider,  setMobileMoneyProvider]  = useState<"mtn" | "airtel" | "">(tenant.mobileMoneyProvider ?? "");
  const [mobileMoneyNumber,    setMobileMoneyNumber]    = useState(tenant.mobileMoneyNumber ?? "");
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
      nin: nin || undefined,
      whatsappNumber: whatsappNumber || undefined,
      mobileMoneyProvider: (mobileMoneyProvider as "mtn" | "airtel") || undefined,
      mobileMoneyNumber: mobileMoneyNumber || undefined,
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
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="nin">NIN</Label>
              <Input id="nin" value={nin} onChange={(e) => setNin(e.target.value)} placeholder="e.g. CM90100000ABCD" />
              <p className="text-xs text-muted-foreground">National Identification Number — appears on tenancy agreement</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="whatsappNumber">WhatsApp / Contact Number</Label>
              <Input id="whatsappNumber" value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} placeholder="+256 700 000000" type="tel" />
              <p className="text-xs text-muted-foreground">Used as contact phone on the tenancy agreement</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="mmProvider">Mobile Money Provider</Label>
              <Select value={mobileMoneyProvider} onValueChange={(v) => setMobileMoneyProvider(v as "mtn" | "airtel" | "")}>
                <SelectTrigger id="mmProvider"><SelectValue placeholder="Select provider" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mtn">MTN Mobile Money</SelectItem>
                  <SelectItem value="airtel">Airtel Money</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mmNumber">Mobile Money Number</Label>
              <Input id="mmNumber" value={mobileMoneyNumber} onChange={(e) => setMobileMoneyNumber(e.target.value)} placeholder="+256 770 000000" type="tel" />
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
                <div key={i} className="group flex items-start gap-2 rounded-lg bg-primary/5 border border-primary/10 px-3 py-2">
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

/** Shown in the sidebar when the tenant hasn't finished onboarding yet. */
function ResendInviteSection({ tenant }: { tenant: Tenant }) {
  const { mutate: resend, isPending, data: newInvite } = useResendInvite();
  const [copied, setCopied] = useState(false);

  const resendableStates = ["invited", "started", "rejected"];
  if (!resendableStates.includes(tenant.onboardingState)) return null;

  const inviteUrl = newInvite
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/onboarding/${newInvite.token}`
    : null;

  function handleCopy() {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Card className={
      tenant.onboardingState === "rejected"
        ? "border-destructive/30 bg-destructive/5 dark:bg-destructive/10"
        : "border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20"
    }>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <RefreshCw className="h-4 w-4" />
          {tenant.onboardingState === "rejected" ? "Re-invite Tenant" : "Resend Invite"}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {tenant.onboardingState === "rejected"
            ? "Generate a new link so the tenant can resubmit their application."
            : tenant.onboardingState === "started"
            ? "The tenant started but hasn't finished. Send a fresh link — their progress is saved."
            : "The invite link may have expired. Generate a new 72-hour link."}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {inviteUrl ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">New link generated:</p>
            <div className="flex gap-1.5">
              <code className="flex-1 text-xs bg-muted rounded px-2 py-1.5 truncate block">
                {inviteUrl}
              </code>
              <Button size="icon-sm" variant="outline" onClick={handleCopy} title="Copy link">
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon-sm"
                variant="outline"
                onClick={() => window.open(inviteUrl, "_blank")}
                title="Open link"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </div>
            {copied && <p className="text-xs text-emerald-600">Copied to clipboard!</p>}
          </div>
        ) : (
          <Button
            size="sm"
            className="w-full"
            loading={isPending}
            onClick={() => resend(tenant.id)}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Generate New Link
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function ApproveRejectSection({ tenant }: { tenant: Tenant }) {
  const { mutate: approve, isPending: approving } = useApproveOnboarding();
  const { mutate: reject, isPending: rejecting } = useRejectOnboarding();
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);

  if (tenant.onboardingState !== "submitted") return null;

  return (
    <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-amber-800 dark:text-amber-200">
          Review Application
        </CardTitle>
        <p className="text-sm text-amber-700 dark:text-amber-300">
          {tenant.firstName} {tenant.lastName} has submitted their onboarding application.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {!showRejectForm ? (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="success"
              className="flex-1"
              loading={approving}
              onClick={() => approve(tenant.id)}
            >
              <CheckCircle className="h-4 w-4" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="flex-1"
              onClick={() => setShowRejectForm(true)}
            >
              <XCircle className="h-4 w-4" />
              Reject
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection (will be shown to tenant)…"
              rows={3}
              className="resize-none text-sm"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => { setShowRejectForm(false); setRejectReason(""); }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="flex-1"
                loading={rejecting}
                disabled={!rejectReason.trim()}
                onClick={() => reject({ tenantId: tenant.id, reason: rejectReason })}
              >
                Confirm Rejection
              </Button>
            </div>
          </div>
        )}
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
                {tenant.nin && (
                  <>
                    <Separator />
                    <div className="flex items-center gap-2 text-sm">
                      <Fingerprint className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">NIN:</span>
                      <span className="font-mono">{tenant.nin}</span>
                    </div>
                  </>
                )}
                {tenant.whatsappNumber && (
                  <>
                    <Separator />
                    <div className="flex items-center gap-2 text-sm">
                      <MessageCircle className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">WhatsApp:</span>
                      <a href={`tel:${tenant.whatsappNumber}`} className="hover:underline">{tenant.whatsappNumber}</a>
                    </div>
                  </>
                )}
                {tenant.mobileMoneyNumber && (
                  <>
                    <Separator />
                    <div className="flex items-center gap-2 text-sm">
                      <Banknote className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Mobile Money:</span>
                      <span>
                        {tenant.mobileMoneyProvider === "mtn" ? "MTN" : tenant.mobileMoneyProvider === "airtel" ? "Airtel" : ""}
                        {tenant.mobileMoneyProvider && " — "}
                        {tenant.mobileMoneyNumber}
                      </span>
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
            {canEdit && <ResendInviteSection tenant={tenant} />}
            {canEdit && <ApproveRejectSection tenant={tenant} />}

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
                  <span className="text-muted-foreground">Ref</span>
                  <span className="font-mono text-xs text-muted-foreground">#{tenant.id.slice(-6).toUpperCase()}</span>
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
