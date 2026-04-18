"use client";

import { CheckCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { AgreementPreview } from "@/types/onboarding";

interface Props {
  preview: AgreementPreview;
  onNext: () => void;
}

export function PaymentSuccessStep({ preview, onNext }: Props) {
  function fmt(n: number) {
    return `${preview.currency} ${n.toLocaleString()}`;
  }

  return (
    <Card>
      <CardContent className="pt-8 pb-6 space-y-6">
        <div className="text-center space-y-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-100/40 mx-auto">
            <CheckCircle className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Unit Secured!</h2>
            <p className="text-muted-foreground text-sm mt-1">
              Your payment has been confirmed. {preview.unitName} at{" "}
              {preview.propertyName} is reserved for you.
            </p>
          </div>
        </div>

        {/* Payment summary */}
        <div className="rounded-[6px] border bg-muted/20 p-4 space-y-2 text-sm">
          <p className="font-medium">Payment confirmed</p>
          {preview.totalDeposit > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Security deposit</span>
              <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                {fmt(preview.totalDeposit)} ✓
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              Advance rent ({preview.advancePaymentMonths} month
              {preview.advancePaymentMonths !== 1 ? "s" : ""})
            </span>
            <span className="text-emerald-700 dark:text-emerald-400 font-medium">
              {fmt(preview.totalAdvanceRent)} ✓
            </span>
          </div>
          <Separator />
          <div className="flex justify-between font-semibold">
            <span>Total paid</span>
            <span>{fmt(preview.totalDueAtOnboarding)}</span>
          </div>
        </div>

        <div className="rounded-[6px] border border-blue-200 bg-blue-50 dark:border-blue-200 dark:bg-blue-100/40 p-3 text-sm text-blue-800 dark:text-blue-200">
          <p className="font-medium mb-0.5">Next: Sign your agreement</p>
          <p>
            You will now sign the final tenancy agreement. The terms will be
            identical to the preview you accepted.
          </p>
        </div>

        <Button className="w-full" onClick={onNext}>
          Sign Agreement →
        </Button>
      </CardContent>
    </Card>
  );
}
