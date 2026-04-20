"use client";

import { useState } from "react";
import { Plus, Trash2, Loader2, Users, MailCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/common/PageHeader";
import { usePermissions } from "@/hooks/usePermissions";
import { useLandlordInvites, useCreateLandlordInvite, useRevokeLandlordInvite } from "@/hooks/useLandlordInvites";
import { useProperties } from "@/hooks/useProperties";
import { toast } from "@/store/useUIStore";

const EMPTY_FORM = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  propertyIds: [] as string[],
  message: "",
};

export default function LandlordsPage() {
  const { canManageOrg } = usePermissions();

  const { data: invites = [], isLoading } = useLandlordInvites();
  const { mutate: createInvite, isPending: creating } = useCreateLandlordInvite();
  const { mutate: revokeInvite } = useRevokeLandlordInvite();
  const { data: propertiesData } = useProperties();
  const allProperties = propertiesData?.data ?? [];

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  function handleCreate() {
    if (!form.firstName || !form.lastName || !form.email) {
      toast.error("Please fill in first name, last name and email");
      return;
    }
    if (form.propertyIds.length === 0) {
      toast.error("Select at least one property");
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

  const statusStyle = (status: string) => {
    if (status === "accepted")
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400";
    if (status === "pending")
      return "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400";
    return "bg-muted text-muted-foreground";
  };

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
            Landlords receive a private link to set up their account and get read-only access to their properties.
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
                <div key={invite.id} className="flex items-center justify-between py-3.5">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {invite.firstName} {invite.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{invite.email}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {invite.propertyIds.length}{" "}
                      {invite.propertyIds.length === 1 ? "property" : "properties"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-4 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusStyle(invite.status)}`}>
                      {invite.status}
                    </span>
                    {canManageOrg && invite.status === "pending" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          revokeInvite(invite.id, {
                            onSuccess: () => toast.success("Invite revoked"),
                          })
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
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
                <MailCheck className="h-5 w-5" />
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
                <Label>Properties *</Label>
                {allProperties.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No properties found</p>
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
