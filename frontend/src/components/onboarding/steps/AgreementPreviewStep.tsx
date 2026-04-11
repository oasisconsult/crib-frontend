"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, FileText } from "lucide-react";
import DOMPurify from "dompurify";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { usePreviewAgreement } from "@/hooks/useOnboardingFlow";
import type { AgreementPreview } from "@/types/onboarding";

interface Props {
  token: string;
  preview: AgreementPreview | null;
  onNext: () => void;
}

export function AgreementPreviewStep({ token, preview: initialPreview, onNext }: Props) {
  const { mutate: fetchPreview, isPending } = usePreviewAgreement(token);
  const [preview, setPreview] = useState<AgreementPreview | null>(initialPreview);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch preview on mount if we don't yet have the full rendered HTML.
  // The flow-status snapshot may have financial fields but no renderedHtml,
  // so we always call /preview to get the full document HTML.
  useEffect(() => {
    if (!preview?.renderedHtml) {
      fetchPreview(undefined, { onSuccess: setPreview });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Track scroll — enable button only once user reaches the bottom
  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 48;
    if (atBottom) setScrolledToBottom(true);
  }

  if (isPending || !preview || !preview.renderedHtml) {
    return (
      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="h-5 w-64 bg-muted rounded animate-pulse" />
          <div className="h-4 w-full bg-muted rounded animate-pulse" />
          <div className="h-4 w-3/4 bg-muted rounded animate-pulse" />
          <div className="h-96 bg-muted rounded animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <CardTitle>Residential House Lease Agreement</CardTitle>
        </div>
        <CardDescription>
          Read the full agreement carefully before accepting. The Continue button activates
          once you reach the end.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Warning banner */}
        <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 p-3 text-sm text-amber-800 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            This is a <strong>legally binding agreement</strong>. Read all clauses before
            proceeding. Scrolling to the end confirms you have read the full document.
          </span>
        </div>

        {/* Full agreement HTML — height scales with viewport */}
        {preview.renderedHtml ? (
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="h-[70vh] min-h-[400px] overflow-y-auto rounded-lg border bg-white dark:bg-zinc-950 shadow-inner"
            style={{ scrollBehavior: "smooth" }}
            dangerouslySetInnerHTML={{ 
              __html: DOMPurify.sanitize(preview.renderedHtml, {
                ALLOWED_TAGS: [
                  'p', 'br', 'strong', 'em', 'u', 'ol', 'ul', 'li', 
                  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                  'div', 'span', 'table', 'thead', 'tbody', 'tr', 'th', 'td'
                ],
                ALLOWED_ATTR: ['class', 'style'],
                ALLOW_DATA_ATTR: false
              })
            }}
          />
        ) : (
          /* Fallback: plain text summary if HTML not available (older snapshot) */
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="h-[600px] overflow-y-auto rounded-lg border bg-muted/20 p-6 text-sm space-y-4"
          >
            <h3 className="font-bold text-base text-center uppercase tracking-wide">
              Residential House Lease Agreement
            </h3>
            <p>
              This Lease is made between <strong>{preview.tenantName}</strong> (&ldquo;Tenant&rdquo;)
              and the Landlord, for the premises at{" "}
              <strong>{preview.propertyName} — {preview.unitName}</strong>.
            </p>
            <p>
              <strong>Term:</strong> Commencing {preview.startDate},{" "}
              {preview.endDate ?? "month-to-month (rolling)"}.
            </p>
            <p>
              <strong>Rent:</strong> {preview.currency} {preview.monthlyRent.toLocaleString()} per
              month, due on day {preview.rentDayOfMonth}.
            </p>
            <p>
              <strong>Deposit:</strong> {preview.currency} {preview.depositAmount.toLocaleString()}.
            </p>
            <p>
              <strong>Notice:</strong> {preview.noticePeriodDays} days written notice by either
              party.
            </p>
            <p className="text-xs text-muted-foreground text-center pt-8">
              — End of agreement —
            </p>
          </div>
        )}

        {/* Scroll hint */}
        {!scrolledToBottom && (
          <button
            type="button"
            onClick={() => {
              if (scrollRef.current) {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
              }
            }}
            className="flex items-center gap-1 text-xs text-muted-foreground mx-auto hover:text-foreground transition-colors"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            Scroll to read all clauses and enable Continue
          </button>
        )}

        <Button
          className="w-full"
          onClick={onNext}
          disabled={!scrolledToBottom}
        >
          {scrolledToBottom
            ? "I've Read the Full Agreement — Continue to Accept Terms →"
            : "Please scroll to the end of the agreement to continue"}
        </Button>
      </CardContent>
    </Card>
  );
}
