"use client";

import { useState, useEffect } from "react";
import { Cookie, X, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

const CONSENT_KEY = "crib:cookie_consent";
const CONSENT_VERSION = "1"; // bump when policy changes to re-prompt

type ConsentChoice = "all" | "essential";

interface ConsentRecord {
  version: string;
  choice: ConsentChoice;
  timestamp: string;
}

function getStoredConsent(): ConsentRecord | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const record: ConsentRecord = JSON.parse(raw);
    if (record.version !== CONSENT_VERSION) return null;
    return record;
  } catch {
    return null;
  }
}

function saveConsent(choice: ConsentChoice) {
  const record: ConsentRecord = {
    version: CONSENT_VERSION,
    choice,
    timestamp: new Date().toISOString(),
  };
  localStorage.setItem(CONSENT_KEY, JSON.stringify(record));
}

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    // Delay to avoid layout shift on first paint
    const id = setTimeout(() => {
      if (!getStoredConsent()) setVisible(true);
    }, 800);
    return () => clearTimeout(id);
  }, []);

  if (!visible) return null;

  function accept(choice: ConsentChoice) {
    saveConsent(choice);
    setVisible(false);
  }

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Cookie consent"
      className={cn(
        "fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-md z-50",
        "rounded-xl border bg-background shadow-lg p-4 space-y-3 animate-in slide-in-from-bottom-4 duration-300",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Cookie className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm font-semibold">We use cookies</p>
        </div>
        <button
          onClick={() => accept("essential")}
          aria-label="Dismiss (essential cookies only)"
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        We use essential cookies to keep you signed in and remember your preferences.
        We&apos;d also like to use analytics cookies to improve the product.
        {" "}
        <a href="/privacy" className="underline hover:text-foreground">
          Privacy policy
        </a>
      </p>

      {expanded && (
        <div className="space-y-2 text-xs text-muted-foreground border border-primary/15 rounded-lg p-3 bg-primary/5">
          <div>
            <p className="font-medium text-foreground">Essential (always on)</p>
            <p>Session authentication, CSRF protection, theme preference.</p>
          </div>
          <div>
            <p className="font-medium text-foreground">Analytics (optional)</p>
            <p>Anonymous usage metrics to improve the product. No personal data sold.</p>
          </div>
        </div>
      )}

      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {expanded ? "Hide details" : "Manage preferences"}
      </button>

      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="flex-1 text-xs"
          onClick={() => accept("essential")}
        >
          Essential only
        </Button>
        <Button
          size="sm"
          className="flex-1 text-xs"
          onClick={() => accept("all")}
        >
          Accept all
        </Button>
      </div>
    </div>
  );
}
