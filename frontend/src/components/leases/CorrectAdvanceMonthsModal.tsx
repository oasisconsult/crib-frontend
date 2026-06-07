"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogBody, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Edit } from "lucide-react";
import { formatCurrency } from "@/utils/formatters";
import { useCorrectLeaseAdvanceMonths } from "@/hooks/useLeases";

const schema = z.object({
  advanceMonths: z.string().min(1, "Please pick a number of months"),
});

type FormValues = z.infer<typeof schema>;

interface CorrectAdvanceMonthsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leaseId: string;
  currentAdvanceMonths: number;
  monthlyRent: number;
  currency: string;
}

export function CorrectAdvanceMonthsModal({
  open, onOpenChange, leaseId, currentAdvanceMonths, monthlyRent, currency,
}: CorrectAdvanceMonthsModalProps) {
  const { mutate: correctAdvanceMonths, isPending } = useCorrectLeaseAdvanceMonths();
  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { advanceMonths: String(currentAdvanceMonths) },
  });

  const advanceMonths = parseInt(watch("advanceMonths") || "0", 10);

  const onSubmit = (values: FormValues) => {
    correctAdvanceMonths(
      { id: leaseId, advanceMonths: parseInt(values.advanceMonths, 10) },
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
              <DialogTitle>Correct Advance Rent</DialogTitle>
              <DialogDescription className="mt-1">
                Fix a data-entry mistake in how many months of rent are due upfront.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogBody className="space-y-4">
            <Alert>
              <AlertDescription>
                This is only possible before the tenant has accepted the lease terms or any
                onboarding payment has been recorded — once either has happened, the figure
                is part of the agreed/paid record and must be corrected by support.
              </AlertDescription>
            </Alert>

            <div className="space-y-1.5">
              <Label htmlFor="advanceMonths">
                Advance rent months <span className="text-destructive">*</span>
              </Label>
              <Controller
                name="advanceMonths"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="advanceMonths" className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                        <SelectItem key={m} value={String(m)}>
                          {m} month{m !== 1 ? "s" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.advanceMonths && (
                <p className="text-xs text-destructive">{errors.advanceMonths.message}</p>
              )}
              {advanceMonths > 0 && (
                <p className="text-xs text-muted-foreground">
                  = {formatCurrency(monthlyRent * advanceMonths, currency)} due at signing
                </p>
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
