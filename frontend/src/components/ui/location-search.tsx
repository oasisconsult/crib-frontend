"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { MapPin, Navigation, Loader2 } from "lucide-react";
import { cn } from "@/utils/cn";
import { Input } from "@/components/ui/input";
import { UG_CITIES } from "@/constants/locations";
import { useVillageSearch } from "@/hooks/useProperties";
import { geoboxApi } from "@/services/api/geobox";

interface LocationSearchProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function LocationSearch({
  id,
  value,
  onChange,
  disabled,
  placeholder = "e.g. Kampala",
}: LocationSearchProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState(value);
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  const [gpsLoading, setGpsLoading] = React.useState(false);
  const [gpsError, setGpsError] = React.useState<string | null>(null);
  const [showGpsConsent, setShowGpsConsent] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Sync external value changes (e.g. form reset)
  React.useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Debounce search query
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(inputValue.trim()), 300);
    return () => clearTimeout(t);
  }, [inputValue]);

  const { data: searchData, isFetching } = useVillageSearch(debouncedQuery);
  const apiResults = searchData?.areas ?? [];

  // Static fallback: UG_CITIES filtered by typed text
  const filteredCities = inputValue.trim().length === 0
    ? UG_CITIES
    : UG_CITIES.filter((c) =>
        c.toLowerCase().startsWith(inputValue.trim().toLowerCase()),
      );

  // What to show in the dropdown
  const showApiResults = debouncedQuery.length >= 2 && apiResults.length > 0;
  const items: Array<{ id: string; label: string; sub?: string }> = showApiResults
    ? apiResults.map((a) => ({ id: a.id, label: a.name, sub: a.parentName }))
    : filteredCities.map((c) => ({ id: c, label: c }));

  function handleSelect(label: string) {
    setInputValue(label);
    onChange(label);
    setOpen(false);
    inputRef.current?.focus();
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setInputValue(v);
    onChange(v); // free-text is always valid
    setOpen(true);
    setGpsError(null);
  }

  function handleBlur() {
    // Small delay so click on option registers first
    setTimeout(() => setOpen(false), 150);
  }

  async function resolveNearby(lat: number, lng: number) {
    try {
      const res = await geoboxApi.getNearbyAreas(lat, lng, 1);
      if (res.areas.length > 0) {
        const area = res.areas[0];
        const label = area.parentName ? `${area.name}, ${area.parentName}` : area.name;
        setInputValue(label);
        onChange(label);
      }
    } catch {
      // Silently fall through — GPS obtained but lookup failed
    } finally {
      setGpsLoading(false);
    }
  }

  function requestGps() {
    setShowGpsConsent(false);
    setGpsLoading(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolveNearby(pos.coords.latitude, pos.coords.longitude),
      () => {
        setGpsLoading(false);
        setGpsError("Location access denied. Please type the area name.");
      },
      { timeout: 8000 },
    );
  }

  return (
    <div className="relative">
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Anchor asChild>
          <div className="relative flex items-center">
            <span className="pointer-events-none absolute left-3 flex items-center text-muted-foreground" aria-hidden>
              <MapPin className="size-4" />
            </span>
            <Input
              ref={inputRef}
              id={id}
              value={inputValue}
              onChange={handleInputChange}
              onFocus={() => setOpen(true)}
              onBlur={handleBlur}
              disabled={disabled}
              placeholder={placeholder}
              autoComplete="off"
              className="pl-9 pr-9"
            />
            <button
              type="button"
              disabled={disabled || gpsLoading}
              onClick={() => setShowGpsConsent(true)}
              className={cn(
                "absolute right-2.5 flex items-center text-muted-foreground hover:text-foreground transition-colors",
                (disabled || gpsLoading) && "pointer-events-none opacity-50",
              )}
              aria-label="Use my current location"
              title="Detect location"
            >
              {gpsLoading
                ? <Loader2 className="size-4 animate-spin" />
                : <Navigation className="size-4" />}
            </button>
          </div>
        </PopoverPrimitive.Anchor>

        {items.length > 0 && (
          <PopoverPrimitive.Content
            onOpenAutoFocus={(e) => e.preventDefault()}
            side="bottom"
            align="start"
            sideOffset={4}
            className={cn(
              "z-50 w-[var(--radix-popover-trigger-width)] rounded-[var(--radius-md)]",
              "border border-border bg-popover shadow-md",
              "max-h-60 overflow-y-auto",
              "data-[state=open]:animate-in data-[state=closed]:animate-out",
              "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
              "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            )}
          >
            {isFetching && debouncedQuery.length >= 2 && (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> Searching…
              </div>
            )}
            <ul role="listbox" aria-label="Location suggestions" className="py-1">
              {items.map((item) => (
                <li
                  key={item.id}
                  role="option"
                  aria-selected={inputValue === item.label}
                  onMouseDown={(e) => {
                    e.preventDefault(); // prevent input blur before selection
                    handleSelect(item.label);
                  }}
                  className={cn(
                    "flex cursor-pointer flex-col px-3 py-2 text-sm",
                    "hover:bg-emerald-50 hover:text-emerald-800",
                    "dark:hover:bg-emerald-950/30 dark:hover:text-emerald-300",
                    inputValue === item.label && "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300",
                  )}
                >
                  <span className="font-medium">{item.label}</span>
                  {item.sub && (
                    <span className="text-xs text-muted-foreground">{item.sub}</span>
                  )}
                </li>
              ))}
            </ul>
          </PopoverPrimitive.Content>
        )}
      </PopoverPrimitive.Root>

      {/* GPS consent notice (DPPA s.12 — shown before accessing location) */}
      {showGpsConsent && (
        <div className="mt-2 rounded-[var(--radius-md)] border border-border bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">
          <p className="mb-2">
            Your device location is used only to suggest nearby villages. It is not stored.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={requestGps}
              className="rounded px-2 py-1 text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
            >
              Allow
            </button>
            <button
              type="button"
              onClick={() => setShowGpsConsent(false)}
              className="rounded px-2 py-1 text-xs font-medium border border-border hover:bg-muted transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {gpsError && (
        <p className="mt-1 text-xs text-destructive">{gpsError}</p>
      )}
    </div>
  );
}
