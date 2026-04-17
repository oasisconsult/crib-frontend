"use client";

import { useEffect } from "react";
import { Clock, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useOnboardingFlowStatus } from "@/hooks/useOnboardingFlow";

interface Props {
  token: string;
  onPaymentSecured: () => void;
}

export function PaymentPendingStep({ token, onPaymentSecured }: Props) {
  const { data, refetch, isFetching } = useOnboardingFlowStatus(token);

  // Poll every 20 seconds
  useEffect(() => {
    const id = setInterval(() => refetch(), 20_000);
    return () => clearInterval(id);
  }, [refetch]);

  // Advance when payment_secured detected
  useEffect(() => {
    if (data?.currentStep === "payment_success" || data?.paymentSecured) {
      onPaymentSecured();
    }
  }, [data, onPaymentSecured]);

  return (
    <Card>
      <CardContent className="pt-8 pb-8 text-center space-y-5">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-100/40 mx-auto">
          <Clock className="h-8 w-8 text-amber-600 dark:text-amber-400" />
        </div>

        <div className="space-y-1">
          <h2 className="text-xl font-bold">Payment Submitted</h2>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto">
            Your payment reference has been recorded. Your landlord will confirm
            receipt — this usually takes a few minutes.
          </p>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-200 dark:bg-amber-100/40 p-3 text-sm text-amber-800 dark:text-amber-200 max-w-sm mx-auto">
          This page will automatically advance once payment is confirmed. You
          can safely close and return — your progress is saved.
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-1.5"
        >
          <RefreshCw
            className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`}
          />
          Check status
        </Button>
      </CardContent>
    </Card>
  );
}
