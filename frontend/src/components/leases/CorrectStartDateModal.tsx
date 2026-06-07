"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogBody, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Edit } from "lucide-react";
import { useCorrectLeaseStartDate } from "@/hooks/useLeases";

const schema = z.object({
  startDate: z.string().min(1, "Please pick a date"),
});

type FormValues = z.infer<typeof schema>;

interface CorrectStartDateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leaseId: string;
  currentStartDate: string;
  endDate?: string | null;
}

export function CorrectStartDateModal({
  open, onOpenChange, leaseId, currentStartDate, endDate,
}: CorrectStartDateModalProps) {
  const { mutate: correctStartDate, isPending } = useCorrectLeaseStartDate();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { startDate: currentStartDate?.slice(0, 10) },
  });

  const onSubmit = (values: FormValues) => {
    correctStartDate(
      { id: leaseId, startDate: values.startDate },
      {
        onSuccess: () => {
          reset();
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
              <Edit className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>Correct Start Date</DialogTitle>
              <DialogDescription className="mt-1">
                Fix a data-entry mistake in when this lease started.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogBody className="space-y-4">
            <Alert>
              <AlertDescription>
                The lease&apos;s rent schedule is anchored to its start date. Changing it will
                regenerate the schedule to match — this is only possible while no rent has yet
                been collected against this lease.
              </AlertDescription>
            </Alert>

            <div className="space-y-1.5">
              <Label htmlFor="startDate">
                Lease start date <span className="text-destructive">*</span>
              </Label>
              <input
                id="startDate"
                type="date"
                max={endDate ?? undefined}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                {...register("startDate")}
              />
              {errors.startDate && (
                <p className="text-xs text-destructive">{errors.startDate.message}</p>
              )}
            </div>
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" loading={isPending}>
              Save Correction
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
