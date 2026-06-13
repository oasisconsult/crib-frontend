"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle, Gavel } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogBody, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "@/store/useUIStore";
import { MIN_NOTICE_DAYS, NOTICE_TYPE_LABELS } from "../types";
import type { EvictionNoticeCreate, EvictionNoticeType } from "../types";

const NOTICE_TYPES = Object.keys(NOTICE_TYPE_LABELS) as EvictionNoticeType[];

function minEffectiveDate(type: EvictionNoticeType): string {
  const d = new Date();
  d.setDate(d.getDate() + MIN_NOTICE_DAYS[type]);
  return d.toISOString().split("T")[0];
}

const schema = z
  .object({
    noticeType: z.enum(["non_payment", "breach", "end_of_term", "redevelopment"]),
    reason: z.string().min(10, "Please provide a specific reason (min 10 characters)").max(2000),
    effectiveDate: z.string().min(1, "Effective date is required"),
    courtReference: z.string().max(255).optional(),
    notes: z.string().max(1000).optional(),
  })
  .refine(
    (v) => v.effectiveDate >= minEffectiveDate(v.noticeType as EvictionNoticeType),
    (v) => ({
      message: `Effective date must be at least ${MIN_NOTICE_DAYS[v.noticeType as EvictionNoticeType]} days from today for a '${NOTICE_TYPE_LABELS[v.noticeType as EvictionNoticeType]}' notice`,
      path: ["effectiveDate"],
    })
  )
  .refine(
    (v) => v.noticeType !== "redevelopment" || !!v.courtReference?.trim(),
    { message: "A court reference number is required for redevelopment notices", path: ["courtReference"] }
  );

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (body: EvictionNoticeCreate) => Promise<unknown>;
}

export function IssueEvictionModal({ open, onOpenChange, onCreate }: Props) {
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      noticeType: "non_payment",
      effectiveDate: minEffectiveDate("non_payment"),
    },
  });

  const noticeType = watch("noticeType") as EvictionNoticeType;
  const isRedevelopment = noticeType === "redevelopment";

  function handleTypeChange(val: string) {
    const type = val as EvictionNoticeType;
    setValue("noticeType", type);
    setValue("effectiveDate", minEffectiveDate(type));
  }

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      await onCreate({
        noticeType: values.noticeType,
        reason: values.reason,
        effectiveDate: values.effectiveDate,
        courtReference: values.courtReference || null,
        notes: values.notes || null,
      });
      toast.success("Eviction notice issued");
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
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
              <Gavel className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>Issue Eviction Notice</DialogTitle>
              <DialogDescription className="mt-1">
                Uganda LTA 2022 §§ 73-78 — minimum notice periods apply by notice type.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogBody className="space-y-4">

            <div className="space-y-1.5">
              <Label htmlFor="noticeType">
                Notice type <span className="text-destructive">*</span>
              </Label>
              <Select value={noticeType} onValueChange={handleTypeChange}>
                <SelectTrigger id="noticeType" className={errors.noticeType ? "border-destructive" : ""}>
                  <SelectValue placeholder="Select notice type" />
                </SelectTrigger>
                <SelectContent>
                  {NOTICE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {NOTICE_TYPE_LABELS[t]}
                      <span className="ml-2 text-muted-foreground text-xs">
                        ({MIN_NOTICE_DAYS[t]}-day min. notice)
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reason">
                Reason <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="reason"
                placeholder="Provide specific grounds for eviction (e.g. months unpaid, which clause was breached)..."
                rows={4}
                {...register("reason")}
              />
              {errors.reason && (
                <p className="text-xs text-destructive">{errors.reason.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="effectiveDate">
                Effective date (date tenant must vacate) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="effectiveDate"
                type="date"
                min={minEffectiveDate(noticeType)}
                error={!!errors.effectiveDate}
                {...register("effectiveDate")}
              />
              {errors.effectiveDate && (
                <p className="text-xs text-destructive">{errors.effectiveDate.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Earliest: {minEffectiveDate(noticeType)} ({MIN_NOTICE_DAYS[noticeType]} days from today)
              </p>
            </div>

            {isRedevelopment && (
              <div className="space-y-1.5">
                <Label htmlFor="courtReference">
                  Court reference number <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="courtReference"
                  placeholder="e.g. HCCS-2026-1234"
                  error={!!errors.courtReference}
                  {...register("courtReference")}
                />
                {errors.courtReference && (
                  <p className="text-xs text-destructive">{errors.courtReference.message}</p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                placeholder="Additional context..."
                rows={2}
                {...register("notes")}
              />
            </div>

            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This action creates a legal notice. Ensure grounds are valid under Uganda LTA 2022
                before issuing. Tenants have the right to dispute at the Rent Restriction Tribunal.
              </AlertDescription>
            </Alert>

          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" loading={submitting}>
              Issue Notice
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
