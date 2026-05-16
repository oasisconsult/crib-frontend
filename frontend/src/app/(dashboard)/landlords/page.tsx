"use client";

import { useState } from "react";
import { Plus, Trash2, Loader2, Users, Mail, Copy, Check, RefreshCw, Link } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/common/PageHeader";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useLandlordInvites,
  useCreateLandlordInvite,
  useRevokeLandlordInvite,
  useResendLandlordInvite,
} from "@/hooks/useLandlordInvites";
import { useProperties } from "@/hooks/useProperties";
import { toast } from "@/store/useUIStore";
import type { LandlordInvite } from "@/services/api/landlords";

const EMPTY_FORM = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  propertyIds: [] as string[],
  message: "",
};

function inviteUrl(token: string) {
  return `${window.location.origin}/onboarding/landlord/${token}`;
}

function CopyUrlButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(inviteUrl(token));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }

  return (
    <button
      onClick={handleCopy}
      title="Copy invite link"
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 text-emerald-500" />
          <span className="text-emerald-600 dark:text-emerald-400">Copied!</span>
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          Copy link
        </>
      )}
    </button>
  );
}

function InviteUrlRow({ token }: { token: string }) {
  const [expanded, setExpanded] = useState(false);
  const url = inviteUrl(token);

  return (
    <div className="mt-1">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
      >
        <Link className="h-3 w-3" />
        {expanded ? "Hide link" : "Show link"}
      </button>
      {expanded && (
        <div className="mt-1.5 flex items-center gap-2">
          <code className="flex-1 text-[11px] bg-muted/60 rounded px-2 py-1 truncate select-all">
            {url}
          </code>
          <CopyUrlButton token={token} />
        </div>
      )}
    </div>
  );
}

function InviteRow({
  invite,
  canManage,
  onRevoke,
  onResend,
  resending,
}: {
  invite: LandlordInvite;
  canManage: boolean;
  onRevoke: () => void;
  onResend: () => void;
  resending: boolean;
}) {
  const isPending = invite.status === "pending";

  const statusStyle =
    invite.status === "accepted"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
      : isPending
        ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
        : "bg-muted text-muted-foreground";

  return (
    <div className="py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">
            {invite.firstName} {invite.lastName}
          </p>
          <p className="text-xs text-muted-foreground truncate">{invite.email}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {invite.propertyIds.length === 0
              ? "No properties assigned"
              : `${invite.propertyIds.length} ${invite.propertyIds.length === 1 ? "property" : "properties"}`}
          </p>
          {isPending && <InviteUrlRow token={invite.token} />}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusStyle}`}>
            {invite.status}
          </span>

          {canManage && isPending && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs gap-1"
                onClick={onResend}
                disabled={resending}
                title="Resend invite email"
              >
                {resending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                Resend
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={onRevoke}
                title="Revoke invite"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LandlordsPage() {
  const { canManageOrg } = usePermissions();

  const { data: invites = [], isLoading } = useLandlordInvites();
  const { mutate: createInvite, isPending: creating } = useCreateLandlordInvite();
  const { mutate: revokeInvite } = useRevokeLandlordInvite();
  const { mutate: resendInvite, variables: resendingId, isPending: isResending } = useResendLandlordInvite();

  const { data: propertiesData } = useProperties();
  const allProperties = propertiesData?.data ?? [];

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  function handleCreate() {
    if (!form.firstName || !form.lastName || !form.email) {
      toast.error("Please fill in first name, last name and email");
      return;
    }
    createInvite(
      {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone || undefined,
        propertyIds: form.propertyIds,
        message: form.message || undefined,
      },
      {
        onSuccess: () => {
          toast.success("Invite sent");
          setShowModal(false);
          setForm(EMPTY_FORM);
        },
        onError: (err: any) =>
          toast.error("Failed to send invite", err?.response?.data?.detail ?? "Please try again"),
      },
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Landlords"
        description="Invite landlords to view their properties managed by your agency."
        actions={
          canManageOrg ? (
            <Button onClick={() => setShowModal(true)}>
              <Plus className="h-4 w-4" />
              Invite landlord
            </Button>
          ) : undefined
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Landlord Invites</CardTitle>
          <CardDescription>
            Landlords receive a private link to set up their account and get read-only access to
            their properties.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-6">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : invites.length === 0 ? (
            <div className="text-center py-14 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No landlord invites yet</p>
              <p className="text-xs mt-1 max-w-xs mx-auto">
                Invite a landlord to give them view-only access to their properties.
              </p>
              {canManageOrg && (
                <Button size="sm" className="mt-4" onClick={() => setShowModal(true)}>
                  <Plus className="h-4 w-4" />
                  Send first invite
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y">
              {invites.map((invite) => (
                <InviteRow
                  key={invite.id}
                  invite={invite}
                  canManage={canManageOrg}
                  onRevoke={() =>
                    revokeInvite(invite.id, {
                      onSuccess: () => toast.success("Invite revoked"),
                    })
                  }
                  onResend={() =>
                    resendInvite(invite.id, {
                      onSuccess: () => toast.success("Invite resent — expiry extended by 7 days"),
                      onError: (err: any) =>
                        toast.error("Failed to resend", err?.response?.data?.detail ?? ""),
                    })
                  }
                  resending={isResending && resendingId === invite.id}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Invite modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Invite Landlord
              </CardTitle>
              <CardDescription>
                An onboarding link will be emailed to the landlord.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="invFirst">First name *</Label>
                  <Input
                    id="invFirst"
                    value={form.firstName}
                    onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                    placeholder="Jane"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="invLast">Last name *</Label>
                  <Input
                    id="invLast"
                    value={form.lastName}
                    onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                    placeholder="Smith"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invEmail">Email *</Label>
                <Input
                  id="invEmail"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="landlord@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invPhone">Phone (optional)</Label>
                <Input
                  id="invPhone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+256 700 000 000"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Properties <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <p className="text-xs text-muted-foreground">
                  Assign properties now, or skip — the landlord can be assigned properties after they log in.
                </p>
                {allProperties.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No properties in this organisation yet.</p>
                ) : (
                  <div className="border rounded-[6px] divide-y max-h-44 overflow-y-auto">
                    {allProperties.map((p) => (
                      <label
                        key={p.id}
                        className="flex items-center gap-3 px-3 py-2.5 text-sm cursor-pointer hover:bg-muted/50"
                      >
                        <input
                          type="checkbox"
                          checked={form.propertyIds.includes(p.id)}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              propertyIds: e.target.checked
                                ? [...f.propertyIds, p.id]
                                : f.propertyIds.filter((id) => id !== p.id),
                            }))
                          }
                          className="accent-primary"
                        />
                        {p.name}
                      </label>
                    ))}
                  </div>
                )}
                {form.propertyIds.length > 0 && (
                  <p className="text-xs text-muted-foreground">{form.propertyIds.length} selected</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invMsg">Message (optional)</Label>
                <textarea
                  id="invMsg"
                  value={form.message}
                  onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                  placeholder="Welcome message to the landlord…"
                  rows={2}
                  className="w-full rounded-[6px] border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowModal(false);
                    setForm(EMPTY_FORM);
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleCreate} loading={creating}>
                  Send invite
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
