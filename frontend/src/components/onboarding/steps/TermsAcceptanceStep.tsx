"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { useAcceptTerms } from "@/hooks/useOnboardingFlow";

interface Props {
  token: string;
  onNext: (termsAcceptedAt: string) => void;
  onBack: () => void;
}

export function TermsAcceptanceStep({ token, onNext, onBack }: Props) {
  const [checkedTerms, setCheckedTerms] = useState(false);
  const [checkedPayment, setCheckedPayment] = useState(false);
  const {
    mutate: acceptTerms,
    isPending,
    isError,
    error,
  } = useAcceptTerms(token);

  const canProceed = checkedTerms && checkedPayment;

  function handleAccept() {
    acceptTerms(true, {
      onSuccess: (result) => onNext(result.termsAcceptedAt),
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <CardTitle>Accept Tenancy Terms</CardTitle>
        </div>
        <CardDescription>
          Please confirm you have read and agree to the tenancy terms.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 dark:border-indigo-200 dark:bg-indigo-100/40 p-4 text-sm text-indigo-800 dark:text-indigo-200 space-y-1">
          <p className="font-medium">Why this matters</p>
          <p>
            Your explicit acceptance creates a legally binding record of your
            agreement to the terms shown in the preview. Payment secures your
            unit and confirms your commitment.
          </p>
        </div>

        <div className="space-y-3">
          <label className="flex items-start gap-3 cursor-pointer group">
            <div className="mt-0.5">
              <input
                type="checkbox"
                checked={checkedTerms}
                onChange={(e) => setCheckedTerms(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
            </div>
            <span className="text-sm leading-relaxed">
              <span className="font-medium">I have read and agree</span> to the
              tenancy terms shown in the agreement preview, including the rent
              amount, deposit, notice period, and late fee policy.
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer group">
            <div className="mt-0.5">
              <input
                type="checkbox"
                checked={checkedPayment}
                onChange={(e) => setCheckedPayment(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
            </div>
            <span className="text-sm leading-relaxed">
              <span className="font-medium">I understand</span> that making
              payment secures this unit for me, and the final agreement I sign
              will match the terms I have reviewed.
            </span>
          </label>
        </div>

        {isError && (
          <p className="text-sm text-destructive">
            {(error as Error)?.message ??
              "Failed to record acceptance. Please try again."}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <Button variant="outline" onClick={onBack} disabled={isPending}>
            ← Back
          </Button>
          <Button
            className="flex-1"
            onClick={handleAccept}
            disabled={!canProceed || isPending}
            loading={isPending}
          >
            Accept Terms &amp; Continue to Payment →
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
