"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Copy, Check, Link2, UserPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useInviteTenant } from "@/hooks/useTenants";
import { useProperties } from "@/hooks/useProperties";
import { useUnits } from "@/hooks/useProperties";
import type { TenantInvite } from "@/types";

const FORM_ID = "invite-tenant-form";

const schema = z.object({
  name:       z.string().min(2, "Full name is required"),
  email:      z.string().email("Enter a valid email address"),
  propertyId: z.string().min(1, "Please select a property"),
  unitId:     z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface InviteModalProps {
  open:           boolean;
  onOpenChange:   (open: boolean) => void;
  propertyId?:    string;
  unitId?:        string;
}

export function InviteModal({
  open,
  onOpenChange,
  propertyId,
  unitId,
}: InviteModalProps) {
  const [invite, setInvite]   = useState<TenantInvite | null>(null);
  const [copied, setCopied]   = useState(false);

  const { mutate: sendInvite, isPending } = useInviteTenant();
  const { data: propertiesData } = useProperties({ pageSize: 100 });
  const properties = propertiesData?.data ?? [];

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      propertyId: propertyId ?? "",
      unitId:     unitId     ?? "",
    },
  });

  const selectedPropertyId = watch("propertyId");
  const selectedUnitId     = watch("unitId");

  // Load units only when a property is selected
  const { data: unitsData } = useUnits(selectedPropertyId, { pageSize: 200 });
  const units = unitsData?.data ?? [];

  const inviteLink = invite
    ? `${window.location.origin}/onboarding/${invite.token}`
    : "";

  const copyLink = async () => {
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const onSubmit = (values: FormValues) => {
    sendInvite(values, {
      onSuccess: (data) => setInvite(data),
    });
  };

  const handleClose = (next: boolean) => {
    if (!next) {
      reset();
      setInvite(null);
    }
    onOpenChange(next);
  };

  // ── Success state ─────────────────────────────────────────────────────────
  if (invite) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Invitation Sent</DialogTitle>
            <DialogDescription>
              Share the link below with <strong>{invite.name ?? invite.email}</strong>.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <Alert variant="success">
              <Check className="h-4 w-4" />
              <AlertDescription>
                Sent to <strong>{invite.email}</strong>. Link expires in 72 hours.
              </AlertDescription>
            </Alert>

            <div className="space-y-1.5">
              <Label>Onboarding link</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={inviteLink}
                  className="font-mono text-xs"
                  leftIcon={<Link2 className="h-3.5 w-3.5" />}
                />
                <Button
                  size="icon"
                  variant="outline"
                  onClick={copyLink}
                  aria-label="Copy link"
                  className="shrink-0"
                >
                  {copied
                    ? <Check className="h-4 w-4 text-emerald-600" />
                    : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Share this link securely — do not post it publicly.
              </p>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button onClick={() => handleClose(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Form state ────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4.5 w-4.5 text-primary" aria-hidden="true" />
            Invite Tenant
          </DialogTitle>
          <DialogDescription>
            Send a secure onboarding link to a prospective tenant.
          </DialogDescription>
        </DialogHeader>

        {/* form wraps only the body; footer uses form={FORM_ID} */}
        <form id={FORM_ID} onSubmit={handleSubmit(onSubmit)}>
          <DialogBody className="space-y-4">
            {/* Full name */}
            <div className="space-y-1.5">
              <Label htmlFor="inv-name">
                Full name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="inv-name"
                placeholder="e.g. Jane Smith"
                error={!!errors.name}
                autoComplete="off"
                {...register("name")}
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="inv-email">
                Email address <span className="text-destructive">*</span>
              </Label>
              <Input
                id="inv-email"
                type="email"
                placeholder="jane@example.com"
                error={!!errors.email}
                autoComplete="off"
                {...register("email")}
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>

            {/* Property */}
            <div className="space-y-1.5">
              <Label htmlFor="inv-property">
                Property <span className="text-destructive">*</span>
              </Label>
              <Select
                value={selectedPropertyId}
                onValueChange={(v) => {
                  setValue("propertyId", v, { shouldValidate: true });
                  setValue("unitId", ""); // reset unit when property changes
                }}
              >
                <SelectTrigger
                  id="inv-property"
                  className={errors.propertyId ? "border-destructive" : ""}
                >
                  <SelectValue placeholder="Select a property…" />
                </SelectTrigger>
                <SelectContent>
                  {properties.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      No properties found
                    </div>
                  ) : (
                    properties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {errors.propertyId && (
                <p className="text-xs text-destructive">{errors.propertyId.message}</p>
              )}
            </div>

            {/* Unit — only shown when a property is selected */}
            {selectedPropertyId && (
              <div className="space-y-1.5">
                <Label htmlFor="inv-unit">
                  Unit{" "}
                  <span className="text-xs text-muted-foreground font-normal">
                    (optional)
                  </span>
                </Label>
                <Select
                  value={selectedUnitId ?? ""}
                  onValueChange={(v) =>
                    setValue("unitId", v === "_none" ? "" : v, { shouldValidate: true })
                  }
                >
                  <SelectTrigger id="inv-unit">
                    <SelectValue placeholder="Select a unit…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">
                      <span className="text-muted-foreground">No specific unit</span>
                    </SelectItem>
                    {units.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name ?? u.unitNumber ?? u.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </DialogBody>
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleClose(false)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            loading={isPending}
          >
            Send invite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
