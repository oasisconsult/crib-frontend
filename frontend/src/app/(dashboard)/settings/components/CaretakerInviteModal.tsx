"use client";

import { useState } from "react";
import { UserPlus, Loader2, Check, Building2, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/utils/cn";
import { useCreateCaretakerInvite } from "@/hooks/useCaretakers";
import { useProperties } from "@/hooks/useProperties";
import type { CaretakerPermissionLevel } from "@/services/api/caretakers";

interface Props {
  onClose: () => void;
}

const PERMISSION_OPTIONS: {
  value: CaretakerPermissionLevel;
  label: string;
  description: string;
}[] = [
  {
    value: "full",
    label: "Full Access",
    description: "Properties, tenants, leases, maintenance, payments and analytics.",
  },
  {
    value: "operations_only",
    label: "Operations Only",
    description: "Properties, tenants, leases and maintenance. No payment amounts or financial reports.",
  },
];

export function CaretakerInviteModal({ onClose }: Props) {
  const [email,       setEmail]       = useState("");
  const [firstName,   setFirstName]   = useState("");
  const [lastName,    setLastName]    = useState("");
  const [phone,       setPhone]       = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [permission,  setPermission]  = useState<CaretakerPermissionLevel>("full");
  const [sent, setSent] = useState(false);

  const { data: propertiesData, isLoading: loadingProps } = useProperties({ pageSize: 100 });
  const properties = propertiesData?.data ?? [];

  const { mutate: invite, isPending } = useCreateCaretakerInvite();

  function toggleProperty(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function handleSubmit() {
    if (!email.trim() || !firstName.trim() || !lastName.trim() || selectedIds.length === 0) return;
    invite(
      {
        email: email.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim() || undefined,
        propertyIds: selectedIds,
        permissionLevel: permission,
      },
      {
        onSuccess: () => setSent(true),
      },
    );
  }

  const canSubmit = email.trim() && firstName.trim() && lastName.trim() && selectedIds.length > 0;

  // ── Success state ──────────────────────────────────────────────────────────

  if (sent) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/20">
              <Check className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-lg font-semibold">Invitation sent!</p>
              <p className="text-sm text-muted-foreground mt-1">
                {firstName} will receive an email with a link to set up their caretaker account.
                The invite expires in 7 days.
              </p>
            </div>
            <Button onClick={onClose}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" aria-hidden />
            Invite a Caretaker
          </DialogTitle>
          <DialogDescription>
            The caretaker will be able to log in and manage the properties you select on your behalf.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-2">

          {/* Personal details */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Personal Details
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ct-first">First name *</Label>
                <Input
                  id="ct-first"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Jane"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ct-last">Last name *</Label>
                <Input
                  id="ct-last"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Nakato"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ct-email">Email address *</Label>
                <Input
                  id="ct-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="caretaker@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ct-phone">Phone (optional)</Label>
                <Input
                  id="ct-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+256 700 000000"
                />
              </div>
            </div>
          </div>

          {/* Property selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Properties to Delegate *
              </p>
              {selectedIds.length > 0 && (
                <span className="text-xs text-muted-foreground">{selectedIds.length} selected</span>
              )}
            </div>
            {loadingProps ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
                ))}
              </div>
            ) : properties.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No properties in your portfolio yet.
              </p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {properties.map((p) => {
                  const selected = selectedIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleProperty(p.id)}
                      className={cn(
                        "w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                        selected
                          ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10"
                          : "border-border bg-background hover:border-primary/40 hover:bg-accent",
                      )}
                    >
                      <div className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors",
                        selected ? "border-emerald-500 bg-emerald-500" : "border-border bg-background",
                      )}>
                        {selected && <Check className="h-3 w-3 text-white" aria-hidden />}
                      </div>
                      <div className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-primary/10 shrink-0">
                        <Building2 className="h-3.5 w-3.5 text-primary" aria-hidden />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.address?.city}</p>
                      </div>
                      {p.isSingleUnit && (
                        <Badge variant="info" className="shrink-0">Whole</Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Permission level */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Access Level
            </p>
            <div className="grid grid-cols-1 gap-2">
              {PERMISSION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPermission(opt.value)}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                    permission === opt.value
                      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10"
                      : "border-border hover:border-primary/40 hover:bg-accent",
                  )}
                >
                  <div className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 mt-0.5 transition-colors",
                    permission === opt.value
                      ? "border-emerald-500 bg-emerald-500"
                      : "border-border",
                  )}>
                    {permission === opt.value && (
                      <div className="h-1.5 w-1.5 rounded-full bg-white" aria-hidden />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{opt.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 pt-2 border-t">
            <Button variant="ghost" onClick={onClose} type="button">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit || isPending}
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" aria-hidden />
              )}
              {isPending ? "Sending…" : "Send Invitation"}
            </Button>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
