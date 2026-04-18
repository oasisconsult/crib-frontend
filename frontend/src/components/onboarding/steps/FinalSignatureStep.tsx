"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ESignatureCanvas } from "@/components/onboarding/ESignatureCanvas";
import { useSignAgreement } from "@/hooks/useOnboardingFlow";
import type { AgreementPreview } from "@/types/onboarding";

interface Props {
  token: string;
  preview: AgreementPreview;
  termsAcceptedAt?: string | null;
  onSigned: () => void;
  onBack: () => void;
}

function fmt(n: number, currency: string) {
  return `${currency} ${n.toLocaleString()}`;
}

export function FinalSignatureStep({
  token,
  preview,
  termsAcceptedAt,
  onSigned,
  onBack,
}: Props) {
  const [signature, setSignature] = useState<string | null>(null);
  const {
    mutate: signAgreement,
    isPending,
    isError,
    error,
  } = useSignAgreement(token);

  function handleSign() {
    if (!signature) return;
    signAgreement(signature, { onSuccess: onSigned });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-primary" />
          <CardTitle>Sign Your Agreement</CardTitle>
        </div>
        <CardDescription>
          These are the exact terms you previously accepted.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Same-terms assurance banner */}
        <div className="rounded-[6px] border border-emerald-200 bg-emerald-50 dark:border-emerald-200 dark:bg-emerald-100/40 p-3 text-sm text-emerald-800 dark:text-emerald-200">
          <p className="font-medium mb-0.5">No surprises</p>
          <p>
            The terms below are identical to the agreement preview you accepted.
            Nothing has changed.
          </p>
        </div>

        {/* Locked terms summary */}
        <div className="rounded-[6px] border bg-muted/10 p-4 text-sm space-y-2 select-none pointer-events-none">
          <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">
            Agreed terms
          </p>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Property</span>
              <span className="font-medium">
                {preview.propertyName} — {preview.unitName}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Start date</span>
              <span>{preview.startDate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Monthly rent</span>
              <span>{fmt(preview.monthlyRent, preview.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Deposit</span>
              <span>{fmt(preview.depositAmount, preview.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Notice period</span>
              <span>{preview.noticePeriodDays} days</span>
            </div>
          </div>
          <Separator />
          <p className="text-xs text-muted-foreground text-center">
            Payment confirmed · Terms accepted on{" "}
            {termsAcceptedAt
              ? new Date(termsAcceptedAt).toLocaleDateString()
              : new Date().toLocaleDateString()}
          </p>
        </div>

        {/* Signature canvas */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Your signature</p>
          <ESignatureCanvas onSave={setSignature} />
        </div>

        {isError && (
          <p className="text-sm text-destructive">
            {(error as Error)?.message === "Agreement terms have changed"
              ? "The agreement terms have changed since your preview. Please contact your landlord."
              : ((error as Error)?.message ??
                "Signing failed. Please try again.")}
          </p>
        )}

        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack} disabled={isPending}>
            ← Back
          </Button>
          <Button
            className="flex-1"
            onClick={handleSign}
            disabled={!signature || isPending}
            loading={isPending}
          >
            Sign &amp; Activate My Tenancy ✓
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          By signing you agree to the tenancy terms and confirm the information
          above is correct.
        </p>
      </CardContent>
    </Card>
  );
}
