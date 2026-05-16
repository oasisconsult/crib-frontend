"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search, X, Check } from "lucide-react";
import { cn } from "@/utils/cn";

export interface ComboboxOption {
  id: string;
  label: string;
  sublabel?: string;
  badge?: string;
  badgeClassName?: string;
}

interface Props {
  placeholder?: string;
  onSearch: (q: string) => Promise<ComboboxOption[]>;
  onSelect: (option: ComboboxOption | null) => void;
  selected: ComboboxOption | null;
  debounceMs?: number;
  minChars?: number;
  disabled?: boolean;
}

export function AdminSearchCombobox({
  placeholder = "Search…",
  onSearch,
  onSelect,
  selected,
  debounceMs = 300,
  minChars = 2,
  disabled = false,
}: Props) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<ComboboxOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleChange(value: string) {
    setQuery(value);
    setOpen(true);

    if (timerRef.current) clearTimeout(timerRef.current);

    if (value.length < minChars) {
      setOptions([]);
      return;
    }

    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await onSearch(value);
        setOptions(results);
      } catch {
        setOptions([]);
      } finally {
        setLoading(false);
      }
    }, debounceMs);
  }

  function handleSelect(opt: ComboboxOption) {
    onSelect(opt);
    setQuery("");
    setOpen(false);
    setOptions([]);
  }

  function handleClear() {
    onSelect(null);
    setQuery("");
    setOptions([]);
  }

  if (selected) {
    return (
      <div className="flex items-center gap-2 rounded-[6px] border border-input bg-muted/40 px-3 py-2">
        <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{selected.label}</p>
          {selected.sublabel && (
            <p className="text-xs text-muted-foreground truncate">{selected.sublabel}</p>
          )}
        </div>
        {selected.badge && (
          <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full border font-medium shrink-0", selected.badgeClassName)}>
            {selected.badge}
          </span>
        )}
        <button
          type="button"
          onClick={handleClear}
          disabled={disabled}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          title="Clear selection"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => query.length >= minChars && setOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full rounded-[6px] border border-input bg-background pl-8 pr-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-2.5 h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
      </div>

      {open && query.length >= minChars && (
        <div
          className="absolute z-[200] mt-1 w-full rounded-[6px] border border-border shadow-lg overflow-hidden"
          style={{ backgroundColor: "hsl(var(--card))", color: "hsl(var(--card-foreground))" }}
        >
          {options.length === 0 && !loading ? (
            <p className="px-3 py-2.5 text-sm text-muted-foreground">No results found</p>
          ) : (
            <ul className="max-h-56 overflow-y-auto divide-y divide-border">
              {options.map((opt) => (
                <li key={opt.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(opt)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/60 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{opt.label}</p>
                      {opt.sublabel && (
                        <p className="text-xs text-muted-foreground truncate">{opt.sublabel}</p>
                      )}
                    </div>
                    {opt.badge && (
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full border font-medium shrink-0", opt.badgeClassName)}>
                        {opt.badge}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
