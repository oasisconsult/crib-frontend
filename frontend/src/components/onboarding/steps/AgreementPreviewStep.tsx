"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { usePreviewAgreement } from "@/hooks/useOnboardingFlow";
import type { AgreementPreview } from "@/types/onboarding";

interface Props {
  token: string;
  preview: AgreementPreview | null;
  onNext: () => void;
}

function fmt(n: number, currency: string) {
  return `${currency} ${n.toLocaleString()}`;
}

export function AgreementPreviewStep({ token, preview: initialPreview, onNext }: Props) {
  const { mutate: fetchPreview, isPending } = usePreviewAgreement(token);
  const [preview, setPreview] = useState<AgreementPreview | null>(initialPreview);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch preview on mount if not yet loaded
  useEffect(() => {
    if (!preview) {
      fetchPreview(undefined, { onSuccess: setPreview });
    }
  }, [fetchPreview, preview]);

  // Track scroll position to enable the CTA
  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 40;
    if (atBottom) setScrolledToBottom(true);
  }

  if (isPending || !preview) {
    return (
      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="h-5 w-48 bg-muted rounded animate-pulse" />
          <div className="h-4 w-full bg-muted rounded animate-pulse" />
          <div className="h-4 w-3/4 bg-muted rounded animate-pulse" />
          <div className="h-40 bg-muted rounded animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <CardTitle>Tenancy Agreement Preview</CardTitle>
        </div>
        <CardDescription>
          Review your tenancy terms below before accepting.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Warning banner */}
        <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 p-3 text-sm text-amber-800 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            This is a <strong>preview</strong>. You must accept these terms before
            proceeding to payment. The final agreement will match this preview exactly.
          </span>
        </div>

        {/* Scrollable agreement */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-72 overflow-y-auto rounded-lg border bg-muted/20 p-4 text-sm space-y-4"
        >
          <h3 className="font-semibold text-base">TENANCY AGREEMENT</h3>

          <div className="space-y-1">
            <p className="font-medium">Parties</p>
            <p><span className="text-muted-foreground">Tenant:</span> {preview.tenantName} ({preview.tenantEmail})</p>
            <p><span className="text-muted-foreground">Property:</span> {preview.propertyName} — {preview.unitName}</p>
          </div>

          <Separator />

          <div className="space-y-1">
            <p className="font-medium">Tenancy Period</p>
            <p><span className="text-muted-foreground">Start date:</span> {preview.startDate}</p>
            <p>
              <span className="text-muted-foreground">End date:</span>{" "}
              {preview.endDate ?? "Rolling (month-to-month)"}
            </p>
          </div>

          <Separator />

          <div className="space-y-1">
            <p className="font-medium">Financial Terms</p>
            <p><span className="text-muted-foreground">Monthly rent:</span> {fmt(preview.monthlyRent, preview.currency)}</p>
            <p><span className="text-muted-foreground">Security deposit:</span> {fmt(preview.depositAmount, preview.currency)}</p>
            <p><span className="text-muted-foreground">Advance rent required:</span> {preview.advancePaymentMonths} month{preview.advancePaymentMonths !== 1 ? "s" : ""} ({fmt(preview.totalAdvanceRent, preview.currency)})</p>
            <p><span className="text-muted-foreground">Rent due on:</span> Day {preview.rentDayOfMonth} of each month</p>
            <p><span className="text-muted-foreground">Grace period:</span> {preview.gracePeriodDays} days</p>
            <p>
              <span className="text-muted-foreground">Late fee:</span>{" "}
              {preview.lateFeeType === "flat"
                ? fmt(preview.lateFeeValue, preview.currency)
                : `${preview.lateFeeValue}% of amount due`}
            </p>
          </div>

          <Separator />

          <div className="space-y-1">
            <p className="font-medium">Notice &amp; Termination</p>
            <p><span className="text-muted-foreground">Notice period:</span> {preview.noticePeriodDays} days written notice required by either party.</p>
          </div>

          <Separator />

          <div className="space-y-1 rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20 p-3">
            <p className="font-semibold text-emerald-800 dark:text-emerald-200">Total due at onboarding</p>
            <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
              {fmt(preview.totalDueAtOnboarding, preview.currency)}
            </p>
            <p className="text-xs text-emerald-700 dark:text-emerald-400">
              Deposit ({fmt(preview.totalDeposit, preview.currency)}) +
              Advance rent ({fmt(preview.totalAdvanceRent, preview.currency)})
            </p>
          </div>

          {/* Spacer so user must scroll to it */}
          <p className="text-xs text-muted-foreground text-center pt-4">
            — End of agreement preview —
          </p>
        </div>

        {!scrolledToBottom && (
          <button
            onClick={() => {
              scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
            }}
            className="flex items-center gap-1 text-xs text-muted-foreground mx-auto"
          >
            <ChevronDown className="h-3 w-3" /> Scroll to read all terms
          </button>
        )}

        <Button
          className="w-full"
          onClick={onNext}
          disabled={!scrolledToBottom}
        >
          I&apos;ve Read the Agreement — Continue to Accept Terms →
        </Button>
      </CardContent>
    </Card>
  );
}
