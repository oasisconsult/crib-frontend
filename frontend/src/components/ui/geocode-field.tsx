"use client";

import * as React from "react";
import { Search, ExternalLink, Loader2, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { geoboxApi } from "@/services/api/geobox";

export const GEOCODE_RE = /^[A-Z0-9]+-[A-Z0-9]+$/;

interface GeocodeFieldProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onHierarchyFound: (hierarchy: string[]) => void;
  disabled?: boolean;
  portalUrl?: string;
  whatsappNumber?: string;
  whatsappCreateMessage?: string;
  hierarchyNotFoundMessage?: string;
}

export function GeocodeField({
  id,
  value,
  onChange,
  onHierarchyFound,
  disabled,
  portalUrl = "https://app.geoboxafrica.com",
  whatsappNumber = "+256767171092",
  whatsappCreateMessage = "Hi, I want to create a GeoBox location code for my property",
  hierarchyNotFoundMessage = "Code found but address hierarchy is unavailable — please fill in the fields below manually.",
}: GeocodeFieldProps) {
  const [lookupState, setLookupState] = React.useState<"idle" | "loading" | "found" | "not_found" | "error">("idle");
  const popupRef = React.useRef<Window | null>(null);

  React.useEffect(() => { setLookupState("idle"); }, [value]);

  const formatError = value && !GEOCODE_RE.test(value)
    ? "Must be uppercase letters and digits with a hyphen, e.g. UGKAN-JF5"
    : null;

  const canLookup = GEOCODE_RE.test(value.trim());

  async function handleLookupFor(geocode: string) {
    setLookupState("loading");
    try {
      const data = await geoboxApi.resolveGeocode(geocode);
      if (data.hierarchy && data.hierarchy.length > 0) {
        onHierarchyFound(data.hierarchy);
        setLookupState("found");
      } else {
        setLookupState("not_found");
      }
    } catch {
      setLookupState("error");
    }
  }

  async function handleLookup() {
    if (!canLookup) return;
    await handleLookupFor(value.trim().toUpperCase());
  }

  // Keep a stable ref to handleLookupFor so the message listener below never
  // captures a stale closure without needing to be re-registered.
  const handleLookupForRef = React.useRef(handleLookupFor);
  React.useEffect(() => { handleLookupForRef.current = handleLookupFor; });

  // Listen for the geocode postMessage from the GeoBox portal popup.
  React.useEffect(() => {
    let portalOrigin: string;
    try { portalOrigin = new URL(portalUrl).origin; }
    catch { portalOrigin = portalUrl; }

    function onMessage(e: MessageEvent) {
      if (e.origin !== portalOrigin) return;
      if (e.data?.type !== "geobox:address_created") return;
      const newGeocode = String(e.data.geocode || "").toUpperCase().trim();
      if (!newGeocode) return;
      popupRef.current?.close();
      popupRef.current = null;
      onChange(newGeocode);
      handleLookupForRef.current(newGeocode);
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [portalUrl, onChange]);

  function handleGetCode() {
    const isMobile = /Mobi|Android/i.test(navigator.userAgent);
    if (isMobile) {
      const phone = whatsappNumber.replace(/\D/g, "");
      window.open(
        `https://wa.me/${phone}?text=${encodeURIComponent(whatsappCreateMessage)}`,
        "_blank",
        "noopener,noreferrer",
      );
      return;
    }
    // Desktop: open GeoBox portal as a sized popup with postMessage callback.
    // Note: intentionally no "noopener" — window.opener must work in the portal.
    const createUrl = new URL("/create-address", portalUrl);
    createUrl.searchParams.set("callback", "postmessage");
    createUrl.searchParams.set("origin", window.location.origin);
    const w = 640, h = 780;
    const left = Math.max(0, (screen.width - w) / 2);
    const top = Math.max(0, (screen.height - h) / 2);
    popupRef.current = window.open(
      createUrl.toString(),
      "geobox-create",
      `width=${w},height=${h},left=${left},top=${top}`,
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleLookup(); } }}
          placeholder="e.g. UGKAN-JF5"
          maxLength={20}
          disabled={disabled}
          className={cn(
            "font-mono flex-1",
            formatError && "border-destructive focus-visible:ring-destructive",
          )}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || !canLookup || lookupState === "loading"}
          onClick={handleLookup}
          className="shrink-0 h-9 px-3"
          title="Look up this code in GeoBox and auto-fill the address"
        >
          {lookupState === "loading"
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Search className="h-3.5 w-3.5" />}
          <span className="ml-1.5 text-xs hidden sm:inline">Look up</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={handleGetCode}
          className="shrink-0 h-9 px-3"
          title="Register a location on GeoBox to get a code"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          <span className="ml-1.5 text-xs hidden sm:inline">Get a code</span>
        </Button>
      </div>

      {formatError ? (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle className="h-3 w-3 shrink-0" />{formatError}
        </p>
      ) : lookupState === "found" ? (
        <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3 shrink-0" />Address hierarchy applied from GeoBox.
        </p>
      ) : lookupState === "not_found" ? (
        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
          <AlertCircle className="h-3 w-3 shrink-0" />{hierarchyNotFoundMessage}
        </p>
      ) : lookupState === "error" ? (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle className="h-3 w-3 shrink-0" />GeoBox unavailable — try again or fill in the fields below manually.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground flex items-start gap-1.5">
          <Info className="h-3 w-3 shrink-0 mt-0.5" />
          <span>
            A GeoBox code uniquely identifies your property&apos;s location. Enter it and click{" "}
            <strong className="font-medium text-foreground">Look up</strong> to auto-fill the address.{" "}
            Don&apos;t have one? Click{" "}
            <strong className="font-medium text-foreground">Get a code</strong> to register on GeoBox
            {" "}(opens WhatsApp on mobile, the GeoBox portal on desktop).
          </span>
        </p>
      )}
    </div>
  );
}
