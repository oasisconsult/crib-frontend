"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { TrendingUp, AlertTriangle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogBody, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "@/store/useUIStore";
import type { RentIncreaseCreate } from "../types";

const LTA_MAX_PCT = 10;
const MIN_NOTICE_DAYS = 90;

function minEffectiveDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + MIN_NOTICE_DAYS);
  return d.toISOString().split("T")[0];
}

const schema = z
  .object({
    newRent: z.coerce
      .number({ invalid_type_error: "Enter a valid rent amount" })
      .positive("Rent must be greater than 0"),
    effectiveDate: z.string().min(1, "Effective date is required"),
    notes: z.string().max(1000).optional(),
  })
  .refine((v) => v.effectiveDate >= minEffectiveDate(), {
    message: `Effective date must be at least ${MIN_NOTICE_DAYS} days from today`,
    path: ["effectiveDate"],
  });

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentRent: number;
  currency: string;
  onCreate: (body: RentIncreaseCreate) => Promise<unknown>;
}

export function IssueIncreaseModal({ open, onOpenChange, currentRent, currency, onCreate }: Props) {
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { effectiveDate: minEffectiveDate() },
  });

  const newRent = watch("newRent");
  const pct = newRent && currentRent ? ((newRent - currentRent) / currentRent) * 100 : null;
  const exceedsCap = pct !== null && pct > LTA_MAX_PCT;

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      await onCreate({
        newRent: values.newRent,
        effectiveDate: values.effectiveDate,
        notes: values.notes || null,
      });
      toast.success("Rent increase notice issued");
      reset();
      onOpenChange(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to issue notice";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!submitting) { reset(); onOpenChange(v); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>Issue Rent Increase Notice</DialogTitle>
              <DialogDescription className="mt-1">
                Uganda LTA 2022 — max 10% increase, 90 days advance notice required.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogBody className="space-y-4">
            <div className="rounded-md bg-muted px-4 py-3 text-sm">
              <span className="text-muted-foreground">Current monthly rent: </span>
              <span className="font-semibold">{currency} {currentRent.toLocaleString()}</span>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="newRent">
                New monthly rent ({currency}) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="newRent"
                type="number"
                step="1"
                min="1"
                placeholder="e.g. 1100000"
                error={!!errors.newRent}
                {...register("newRent")}
              />
              {errors.newRent && (
                <p className="text-xs text-destructive">{errors.newRent.message}</p>
              )}
              {pct !== null && !isNaN(pct) && (
                <p className={`text-xs ${exceedsCap ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                  Increase: {pct.toFixed(2)}%
                  {exceedsCap && " — exceeds the 10% LTA 2022 cap"}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="effectiveDate">
                Effective date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="effectiveDate"
                type="date"
                min={minEffectiveDate()}
                error={!!errors.effectiveDate}
                {...register("effectiveDate")}
              />
              {errors.effectiveDate && (
                <p className="text-xs text-destructive">{errors.effectiveDate.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Earliest allowed: {minEffectiveDate()} (90 days from today)
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                placeholder="Additional context for the tenant..."
                rows={3}
                {...register("notes")}
              />
            </div>

            {exceedsCap && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  This increase exceeds 10%. The Uganda Landlord &amp; Tenant Act 2022 caps
                  annual rent increases at 10%. Please reduce the new rent.
                </AlertDescription>
              </Alert>
            )}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting} disabled={exceedsCap}>
              Issue Notice
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
