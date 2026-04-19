"use client";

import { useRef, useState } from "react";
import { CreditCard, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useSubmitOnboardingPayments } from "@/hooks/useOnboardingFlow";
import { usePaymentEstimate } from "@/hooks/usePayments";
import { CostComparisonCard } from "@/components/payments/CostComparisonCard";
import type {
  AgreementPreview,
  OnboardingPaymentItem,
  OnboardingPaymentMethod,
} from "@/types/onboarding";

interface Props {
  token: string;
  leaseId: string;
  tenantId?: string;
  preview: AgreementPreview;
  onNext: () => void;
  onBack: () => void;
}

const METHOD_LABELS: Record<OnboardingPaymentMethod, string> = {
  mobile_money_mtn: "MTN Mobile Money",
  mobile_money_airtel: "Airtel Money",
  bank_transfer: "Bank Transfer",
  cash: "Cash",
};

function useStableIdempotencyKeys() {
  // Generate once per mount — never regenerate on re-render
  const depositKey = useRef(crypto.randomUUID()).current;
  const rentKey = useRef(crypto.randomUUID()).current;
  return { depositKey, rentKey };
}

export function PaymentStep({
  token,
  leaseId,
  tenantId,
  preview,
  onNext,
  onBack,
}: Props) {
  const [method, setMethod] =
    useState<OnboardingPaymentMethod>("mobile_money_mtn");
  const [reference, setReference] = useState("");
  const [showEstimate, setShowEstimate] = useState(false);

  // Fetch cost estimate for the total due amount
  const { data: decision } = usePaymentEstimate(
    leaseId,
    preview.totalDueAtOnboarding > 0
      ? {
          amount: preview.totalDueAtOnboarding,
          currency: preview.currency,
          tenantId,
        }
      : null,
  );
  const {
    mutate: submitPayments,
    isPending,
    isError,
    error,
  } = useSubmitOnboardingPayments(token);
  const { depositKey, rentKey } = useStableIdempotencyKeys();

  const requiresReference = method !== "cash";

  const canSubmit = !requiresReference || reference.trim().length > 0;

  function handleSubmit() {
    const payments: OnboardingPaymentItem[] = [];

    if (preview.totalDeposit > 0) {
      payments.push({
        category: "deposit",
        amount: preview.totalDeposit,
        currency: preview.currency,
        method,
        reference: reference || undefined,
        idempotencyKey: depositKey,
      });
    }

    if (preview.totalAdvanceRent > 0) {
      payments.push({
        category: "rent",
        amount: preview.totalAdvanceRent,
        currency: preview.currency,
        method,
        reference: reference || undefined,
        idempotencyKey: rentKey,
      });
    }

    submitPayments(payments, {
      onSuccess: () => onNext(),
    });
  }

  function fmt(n: number) {
    return `${preview.currency} ${n.toLocaleString()}`;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-primary" />
          <CardTitle>Secure Your Unit</CardTitle>
        </div>
        <CardDescription>
          Make your onboarding payment to secure this unit.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Context badges */}
        <div className="space-y-1.5 text-xs">
          {[
            "✔ You have accepted the agreement terms",
            "✔ Payment secures your unit",
            "✔ Final agreement will be signed after payment",
          ].map((msg) => (
            <div
              key={msg}
              className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400"
            >
              <span>{msg}</span>
            </div>
          ))}
        </div>

        {/* Payment breakdown */}
        <div className="rounded-[6px] border bg-muted/20 p-4 space-y-2 text-sm">
          <p className="font-medium mb-2">Payment breakdown</p>
          {preview.totalDeposit > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Security deposit</span>
              <span>{fmt(preview.totalDeposit)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              Advance rent ({preview.advancePaymentMonths} month
              {preview.advancePaymentMonths !== 1 ? "s" : ""})
            </span>
            <span>{fmt(preview.totalAdvanceRent)}</span>
          </div>
          <Separator />
          <div className="flex justify-between font-semibold">
            <span>Total due now</span>
            <span className="text-emerald-700 dark:text-emerald-400">
              {fmt(preview.totalDueAtOnboarding)}
            </span>
          </div>
        </div>

        {/* Adaptive cost estimate (collapsed by default) */}
        {decision && (
          <div className="space-y-1.5">
            <button
              type="button"
              className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 font-medium hover:underline"
              onClick={() => setShowEstimate((v) => !v)}
            >
              💡 Recommended: {decision.recommendedChannel.replace(/_/g, " ")} ·{" "}
              {showEstimate ? "Hide" : "Compare channel costs"}
            </button>
            {showEstimate && (
              <div className="rounded-[6px] border bg-muted/30 p-3">
                <CostComparisonCard
                  decision={decision}
                  currency={preview.currency}
                />
              </div>
            )}
          </div>
        )}

        {/* Payment method */}
        <div className="space-y-2">
          <Label>Payment method</Label>
          <div className="grid grid-cols-2 gap-2">
            {(
              Object.entries(METHOD_LABELS) as [
                OnboardingPaymentMethod,
                string,
              ][]
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMethod(value)}
                className={`rounded-[6px] border px-3 py-2.5 text-sm text-left transition-colors ${
                  method === value
                    ? "border-teal-600 dark:border-teal-500 bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-400 font-semibold ring-1 ring-inset ring-teal-600/50"
                    : "border-border hover:border-primary/50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Reference (required for non-cash) */}
        {requiresReference && (
          <div className="space-y-1.5">
            <Label htmlFor="reference">
              Payment reference <span className="text-destructive">*</span>
            </Label>
            <Input
              id="reference"
              placeholder={
                method === "bank_transfer"
                  ? "Bank transaction ID or receipt number"
                  : "Mobile money transaction ID"
              }
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Info className="h-3 w-3" />
              Provide the transaction reference so your landlord can verify the
              payment.
            </p>
          </div>
        )}

        {method === "cash" && (
          <div className="rounded-[6px] border border-teal-200 bg-teal-50 dark:border-teal-200 dark:bg-teal-100/40 p-3 text-sm text-teal-800 dark:text-teal-200">
            Pay cash directly to your landlord or property manager. Your payment
            will be confirmed once they receive and record it.
          </div>
        )}

        {isError && (
          <p className="text-sm text-destructive">
            {(error as Error)?.message ??
              "Payment submission failed. Please try again."}
          </p>
        )}

        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack} disabled={isPending}>
            ← Back
          </Button>
          <Button
            className="flex-1"
            onClick={handleSubmit}
            disabled={!canSubmit || isPending}
            loading={isPending}
          >
            Submit Payment →
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
