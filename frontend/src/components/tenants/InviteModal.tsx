"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Copy, Check, Link } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useInviteTenant } from "@/hooks/useTenants";
import type { TenantInvite } from "@/types";

const schema = z.object({
  name: z.string().min(2, "Name required"),
  email: z.string().email("Valid email required"),
  propertyId: z.string().min(1, "Property required"),
  unitId: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface InviteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId?: string;
  unitId?: string;
}

export function InviteModal({ open, onOpenChange, propertyId, unitId }: InviteModalProps) {
  const [invite, setInvite] = useState<TenantInvite | null>(null);
  const [copied, setCopied] = useState(false);
  const { mutate: sendInvite, isPending } = useInviteTenant();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { propertyId: propertyId ?? "", unitId: unitId ?? "" },
  });

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

  const handleClose = (open: boolean) => {
    if (!open) {
      reset();
      setInvite(null);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Tenant</DialogTitle>
          <DialogDescription>
            Send a secure onboarding link to a prospective tenant.
          </DialogDescription>
        </DialogHeader>

        {!invite ? (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Full Name <span className="text-destructive">*</span></Label>
              <Input id="name" placeholder="Jane Smith" error={!!errors.name} {...register("name")} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email <span className="text-destructive">*</span></Label>
              <Input id="email" type="email" placeholder="jane@example.com" error={!!errors.email} {...register("email")} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="propertyId">Property ID <span className="text-destructive">*</span></Label>
              <Input id="propertyId" placeholder="prop-1" error={!!errors.propertyId} {...register("propertyId")} />
              {errors.propertyId && <p className="text-xs text-destructive">{errors.propertyId.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="unitId">Unit ID (optional)</Label>
              <Input id="unitId" placeholder="unit-1" {...register("unitId")} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={isPending}>
                Send Invite
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4">
            <Alert variant="success">
              <Check className="h-4 w-4" />
              <AlertDescription>
                Invitation sent to <strong>{invite.email}</strong>. Link expires in 72 hours.
              </AlertDescription>
            </Alert>

            <div className="space-y-1.5">
              <Label>Onboarding Link</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={inviteLink}
                  className="font-mono text-xs"
                  leftIcon={<Link className="h-3.5 w-3.5" />}
                />
                <Button size="icon" variant="outline" onClick={copyLink} aria-label="Copy link">
                  {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Share this link securely with the tenant</p>
            </div>

            <DialogFooter>
              <Button onClick={() => handleClose(false)}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
