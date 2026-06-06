"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogBody, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useRecordManualPayment } from "@/hooks/usePayments";

const schema = z.object({
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  method: z.enum(["cash", "bank_transfer", "mobile_money_mtn", "mobile_money_airtel", "cheque", "other"]),
  category: z.enum(["rent", "deposit", "late_fee", "other"]),
  paidAt: z.string().min(1, "Payment date is required"),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  mobile_money_mtn: "MTN Mobile Money",
  mobile_money_airtel: "Airtel Mobile Money",
  cheque: "Cheque",
  other: "Other",
};

const CATEGORY_LABELS: Record<string, string> = {
  rent: "Rent",
  deposit: "Security Deposit",
  late_fee: "Late Fee",
  other: "Other",
};

interface RecordManualPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leaseId: string;
  currency?: string;
}

export function RecordManualPaymentModal({
  open,
  onOpenChange,
  leaseId,
  currency = "UGX",
}: RecordManualPaymentModalProps) {
  const { mutate: recordPayment, isPending } = useRecordManualPayment(leaseId);

  const today = new Date().toISOString().split("T")[0];

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
      category: "rent",
      method: "bank_transfer",
      paidAt: today,
    },
  });

  const method = watch("method");
  const category = watch("category");

  const onSubmit = (values: FormValues) => {
    recordPayment(
      {
        amount: values.amount,
        currency,
        category: values.category,
        method: values.method,
        paidAt: values.paidAt ? new Date(values.paidAt).toISOString() : null,
        reference: values.reference || null,
        notes: values.notes || null,
      },
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
          <DialogTitle>Record Manual Payment</DialogTitle>
          <DialogDescription>
            Record a payment made outside Crib via mobile money, bank transfer, or cash.
            Rent schedules will be updated automatically.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogBody className="space-y-4">
            {/* Amount */}
            <div className="space-y-1.5">
              <Label htmlFor="amount">
                Amount ({currency}) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                error={!!errors.amount}
                {...register("amount")}
              />
              {errors.amount && (
                <p className="text-xs text-destructive">{errors.amount.message}</p>
              )}
            </div>

            {/* Category + Method row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>
                  Category <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={category}
                  onValueChange={(v) => setValue("category", v as FormValues["category"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_LABELS).map(([v, label]) => (
                      <SelectItem key={v} value={v}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>
                  Method <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={method}
                  onValueChange={(v) => setValue("method", v as FormValues["method"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(METHOD_LABELS).map(([v, label]) => (
                      <SelectItem key={v} value={v}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Date paid */}
            <div className="space-y-1.5">
              <Label htmlFor="paidAt">
                Date Paid <span className="text-destructive">*</span>
              </Label>
              <Input
                id="paidAt"
                type="date"
                max={today}
                error={!!errors.paidAt}
                {...register("paidAt")}
              />
              {errors.paidAt && (
                <p className="text-xs text-destructive">{errors.paidAt.message}</p>
              )}
            </div>

            {/* Reference */}
            <div className="space-y-1.5">
              <Label htmlFor="reference">Transaction Reference</Label>
              <Input
                id="reference"
                placeholder="e.g. MTN ref: 1234567890"
                {...register("reference")}
              />
              <p className="text-xs text-muted-foreground">
                Mobile money confirmation code or bank transaction ID
              </p>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Any additional details..."
                rows={2}
                {...register("notes")}
              />
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
              Record Payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
