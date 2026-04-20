"use client";

import { useState, useEffect } from "react";
import { User, Bell, Paintbrush, Shield, Save, Building2, Loader2, Sun, Moon, Monitor, Lock, Users, Plus, Trash2, MailCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAppStore } from "@/store/useAppStore";
import { useUIStore } from "@/store/useUIStore";
import { toast } from "@/store/useUIStore";
import { useOrganisation, useUpdateOrganisation } from "@/hooks/useOrganisation";
import { usePermissions } from "@/hooks/usePermissions";
import { useLandlordInvites, useCreateLandlordInvite, useRevokeLandlordInvite } from "@/hooks/useLandlordInvites";
import { useProperties } from "@/hooks/useProperties";

export default function SettingsPage() {
  const user = useAppStore((s) => s.user);
  const { theme, setTheme } = useUIStore();

  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [timezone, setTimezone] = useState(user?.timezone ?? "Africa/Kampala");
  const [saving, setSaving] = useState(false);

  // ── Permissions ─────────────────────────────────────────────────────────────
  const { isSuperAdmin, canManageOrg } = usePermissions();

  // ── Agency / Organisation settings ────────────────────────────────────────
  const { data: org, isLoading: loadingOrg } = useOrganisation();
  const { mutate: updateOrg, isPending: savingAgency } = useUpdateOrganisation();

  const [agencyName,  setAgencyName]  = useState("");
  const [agencyPhone, setAgencyPhone] = useState("");
  const [agencyEmail, setAgencyEmail] = useState("");

  useEffect(() => {
    if (org) {
      setAgencyName(org.name ?? "");
      setAgencyPhone(org.contactPhone ?? "");
      setAgencyEmail(org.contactEmail ?? "");
    }
  }, [org]);

  function handleSaveAgency() {
    const payload: Record<string, string> = {
      contactPhone: agencyPhone,
      contactEmail: agencyEmail,
    };
    if (isSuperAdmin) payload.name = agencyName;
    updateOrg(payload, {
      onSuccess: () => toast.success("Agency details saved"),
      onError: (err: any) =>
        toast.error("Failed to save", err?.response?.data?.detail ?? "Please try again"),
    });
  }

  // ── Landlord invite state ────────────────────────────────────────────────
  const { data: landlordInvites = [], isLoading: loadingInvites } = useLandlordInvites();
  const { mutate: createInvite, isPending: creatingInvite } = useCreateLandlordInvite();
  const { mutate: revokeInvite } = useRevokeLandlordInvite();
  const { data: propertiesData } = useProperties();
  const allProperties = propertiesData?.data ?? [];

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    firstName: "", lastName: "", email: "", phone: "", propertyIds: [] as string[], message: "",
  });

  function handleCreateInvite() {
    if (!inviteForm.email || !inviteForm.firstName || !inviteForm.lastName) {
      toast.error("Missing fields", "Please fill in name and email");
      return;
    }
    if (inviteForm.propertyIds.length === 0) {
      toast.error("No properties selected", "Select at least one property");
      return;
    }
    createInvite(
      {
        email: inviteForm.email,
        firstName: inviteForm.firstName,
        lastName: inviteForm.lastName,
        phone: inviteForm.phone || undefined,
        propertyIds: inviteForm.propertyIds,
        message: inviteForm.message || undefined,
      },
      {
        onSuccess: () => {
          toast.success("Invite sent", `${inviteForm.email} will receive an onboarding link`);
          setShowInviteModal(false);
          setInviteForm({ firstName: "", lastName: "", email: "", phone: "", propertyIds: [], message: "" });
        },
        onError: (err: any) =>
          toast.error("Failed to send invite", err?.response?.data?.detail ?? "Please try again"),
      }
    );
  }

  const [notifs, setNotifs] = useState({
    emailPayments: true,
    emailMaintenance: true,
    emailLeases: true,
    emailInspections: false,
    smsPayments: false,
    smsMaintenance: true,
  });

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const initials = (user?.name ?? "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  function handleSaveProfile() {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      toast.success("Profile updated", "Your changes have been saved.");
    }, 800);
  }

  function handleSavePassword() {
    if (!currentPassword || !newPassword) {
      toast.error("Missing fields", "Please fill in all password fields.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords don't match", "New password and confirmation must match.");
      return;
    }
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password changed", "Your password has been updated.");
    }, 800);
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account preferences</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="profile" className="gap-2">
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">Profile</span>
          </TabsTrigger>
          <TabsTrigger value="agency" className="gap-2">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">Agency</span>
          </TabsTrigger>
          <TabsTrigger value="landlords" className="gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Landlords</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Notifications</span>
          </TabsTrigger>
          <TabsTrigger value="appearance" className="gap-2">
            <Paintbrush className="h-4 w-4" />
            <span className="hidden sm:inline">Appearance</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Security</span>
          </TabsTrigger>
        </TabsList>

        {/* ── Profile ── */}
        <TabsContent value="profile" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription>Update your personal information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={user?.avatar} alt={user?.name} />
                  <AvatarFallback className="text-lg">{initials}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{user?.name ?? "—"}</p>
                  <p className="text-sm text-muted-foreground">{user?.email ?? "—"}</p>
                  <p className="text-xs text-muted-foreground capitalize mt-0.5">{user?.role ?? "—"}</p>
                </div>
              </div>

              <Separator />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Full name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+256 700 000000"
                    type="tel"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" value={user?.email ?? ""} disabled />
                  <p className="text-xs text-muted-foreground">Email cannot be changed here</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger id="timezone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Africa/Kampala">Africa/Kampala (EAT, UTC+3)</SelectItem>
                      <SelectItem value="Africa/Nairobi">Africa/Nairobi (EAT, UTC+3)</SelectItem>
                      <SelectItem value="Africa/Dar_es_Salaam">Africa/Dar_es_Salaam (EAT, UTC+3)</SelectItem>
                      <SelectItem value="UTC">UTC</SelectItem>
                      <SelectItem value="Europe/London">Europe/London</SelectItem>
                      <SelectItem value="America/New_York">America/New_York</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSaveProfile} loading={saving}>
                  <Save className="h-4 w-4" />
                  Save changes
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Agency ── */}
        <TabsContent value="agency" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Agency Details</CardTitle>
              <CardDescription>
                These details appear on tenancy agreements and tenant-facing communications.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {loadingOrg ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading…
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="agencyName" className="flex items-center gap-1.5">
                      Agency Name
                      {!isSuperAdmin && <Lock className="h-3 w-3 text-muted-foreground" />}
                    </Label>
                    <Input
                      id="agencyName"
                      value={agencyName}
                      onChange={(e) => setAgencyName(e.target.value)}
                      placeholder="e.g. GeoBox Properties Ltd"
                      disabled={!isSuperAdmin}
                    />
                    <p className="text-xs text-muted-foreground">
                      {isSuperAdmin
                        ? "Only superadmins can change the agency name"
                        : "Agency name can only be changed by a superadmin"}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="agencyPhone">Contact Phone</Label>
                    <Input
                      id="agencyPhone"
                      type="tel"
                      value={agencyPhone}
                      onChange={(e) => setAgencyPhone(e.target.value)}
                      placeholder="+256 700 000000"
                    />
                    <p className="text-xs text-muted-foreground">
                      Printed in the signature block of tenancy agreements
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="agencyEmail">Contact Email</Label>
                    <Input
                      id="agencyEmail"
                      type="email"
                      value={agencyEmail}
                      onChange={(e) => setAgencyEmail(e.target.value)}
                      placeholder="contact@yourcompany.com"
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={handleSaveAgency} loading={savingAgency}>
                      <Save className="h-4 w-4" />
                      Save details
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Landlords ── */}
        <TabsContent value="landlords" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle>Landlord Access</CardTitle>
                  <CardDescription className="mt-1">
                    Invite landlords to view their properties managed by your agency.
                    They will have read-only access.
                  </CardDescription>
                </div>
                {canManageOrg && (
                  <Button size="sm" onClick={() => setShowInviteModal(true)}>
                    <Plus className="h-4 w-4" />
                    Invite landlord
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loadingInvites ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading invites…
                </div>
              ) : landlordInvites.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No landlord invites yet</p>
                  <p className="text-xs mt-1">Invite a landlord to give them view access to their properties</p>
                </div>
              ) : (
                <div className="divide-y">
                  {landlordInvites.map((invite) => (
                    <div key={invite.id} className="flex items-center justify-between py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {invite.firstName} {invite.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{invite.email}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {invite.propertyIds.length} {invite.propertyIds.length === 1 ? "property" : "properties"}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 ml-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          invite.status === "accepted"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                            : invite.status === "pending"
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                              : "bg-muted text-muted-foreground"
                        }`}>
                          {invite.status}
                        </span>
                        {canManageOrg && invite.status === "pending" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => revokeInvite(invite.id)}
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
          {showInviteModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <Card className="w-full max-w-md">
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
                      <Label htmlFor="inviteFirst">First name *</Label>
                      <Input
                        id="inviteFirst"
                        value={inviteForm.firstName}
                        onChange={(e) => setInviteForm((f) => ({ ...f, firstName: e.target.value }))}
                        placeholder="Jane"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="inviteLast">Last name *</Label>
                      <Input
                        id="inviteLast"
                        value={inviteForm.lastName}
                        onChange={(e) => setInviteForm((f) => ({ ...f, lastName: e.target.value }))}
                        placeholder="Smith"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="inviteEmail">Email address *</Label>
                    <Input
                      id="inviteEmail"
                      type="email"
                      value={inviteForm.email}
                      onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
                      placeholder="landlord@example.com"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="invitePhone">Phone (optional)</Label>
                    <Input
                      id="invitePhone"
                      type="tel"
                      value={inviteForm.phone}
                      onChange={(e) => setInviteForm((f) => ({ ...f, phone: e.target.value }))}
                      placeholder="+256 700 000000"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Properties *</Label>
                    {allProperties.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No properties available</p>
                    ) : (
                      <div className="border rounded-[6px] divide-y max-h-40 overflow-y-auto">
                        {allProperties.map((p) => (
                          <label
                            key={p.id}
                            className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50"
                          >
                            <input
                              type="checkbox"
                              checked={inviteForm.propertyIds.includes(p.id)}
                              onChange={(e) =>
                                setInviteForm((f) => ({
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
                    {inviteForm.propertyIds.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {inviteForm.propertyIds.length} selected
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="inviteMsg">Message (optional)</Label>
                    <textarea
                      id="inviteMsg"
                      value={inviteForm.message}
                      onChange={(e) => setInviteForm((f) => ({ ...f, message: e.target.value }))}
                      placeholder="Welcome message to the landlord…"
                      rows={2}
                      className="w-full rounded-[6px] border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowInviteModal(false);
                        setInviteForm({ firstName: "", lastName: "", email: "", phone: "", propertyIds: [], message: "" });
                      }}
                    >
                      Cancel
                    </Button>
                    <Button onClick={handleCreateInvite} loading={creatingInvite}>
                      Send invite
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ── Notifications ── */}
        <TabsContent value="notifications" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
              <CardDescription>Choose how you want to be notified</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <p className="text-sm font-medium mb-3">Email notifications</p>
                <div className="space-y-3">
                  {(
                    [
                      { key: "emailPayments", label: "Payments", description: "When rent is received or overdue" },
                      { key: "emailMaintenance", label: "Maintenance", description: "New requests and status updates" },
                      { key: "emailLeases", label: "Leases", description: "Renewals, signatures, and expirations" },
                      { key: "emailInspections", label: "Inspections", description: "Scheduled and completed reports" },
                    ] as const
                  ).map(({ key, label, description }) => (
                    <div key={key} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{label}</p>
                        <p className="text-xs text-muted-foreground">{description}</p>
                      </div>
                      <Switch
                        checked={notifs[key]}
                        onCheckedChange={(v) => setNotifs((n) => ({ ...n, [key]: v }))}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <div>
                <p className="text-sm font-medium mb-3">SMS notifications</p>
                <div className="space-y-3">
                  {(
                    [
                      { key: "smsPayments", label: "Payments", description: "Overdue rent alerts via SMS" },
                      { key: "smsMaintenance", label: "Maintenance", description: "Urgent maintenance requests" },
                    ] as const
                  ).map(({ key, label, description }) => (
                    <div key={key} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{label}</p>
                        <p className="text-xs text-muted-foreground">{description}</p>
                      </div>
                      <Switch
                        checked={notifs[key]}
                        onCheckedChange={(v) => setNotifs((n) => ({ ...n, [key]: v }))}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={() => toast.success("Preferences saved")}>
                  <Save className="h-4 w-4" />
                  Save preferences
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Appearance ── */}
        <TabsContent value="appearance" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>Customise how Crib looks for you</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <Label>Theme</Label>
                <div className="grid grid-cols-3 gap-3">
                  {(
                    [
                      { value: "light",  icon: Sun,     label: "Light"  },
                      { value: "dark",   icon: Moon,    label: "Dark"   },
                      { value: "system", icon: Monitor, label: "System" },
                    ] as const
                  ).map(({ value, icon: Icon, label }) => (
                    <button
                      key={value}
                      onClick={() => setTheme(value)}
                      aria-pressed={theme === value}
                      className={`flex flex-col items-center gap-2 rounded-[6px] border-2 p-3 text-sm font-medium transition-colors ${
                        theme === value
                          ? "border-emerald-600 dark:border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 font-semibold"
                          : "border-border text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground"
                      }`}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {theme === "system" ? "Follows your device preference" : `Using ${theme} mode`}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Security ── */}
        <TabsContent value="security" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Change password</CardTitle>
              <CardDescription>Update your account password</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="current-password">Current password</Label>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div className="flex justify-end pt-2">
                <Button onClick={handleSavePassword} loading={saving}>
                  <Save className="h-4 w-4" />
                  Update password
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="mt-4 border-destructive/50">
            <CardHeader>
              <CardTitle className="text-destructive">Danger zone</CardTitle>
              <CardDescription>Irreversible account actions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Delete account</p>
                  <p className="text-xs text-muted-foreground">Permanently remove your account and all data</p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => toast.error("Contact support", "Please email support@crib.ug to delete your account.")}
                >
                  Delete account
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
