"use client";

import { useState } from "react";
import { SlidersHorizontal, X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

export interface FilterOption {
  label: string;
  value: string;
}

export interface FilterField {
  key: string;
  label: string;
  options: FilterOption[];
  /** Backend param name (defaults to key) */
  paramKey?: string;
}

export type ActiveFilters = Record<string, string>;

interface FilterPanelProps {
  fields: FilterField[];
  value: ActiveFilters;
  onChange: (filters: ActiveFilters) => void;
  className?: string;
}

function FilterDropdown({
  field,
  selected,
  onSelect,
}: {
  field: FilterField;
  selected: string;
  onSelect: (key: string, value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const label = field.options.find((o) => o.value === selected)?.label ?? field.label;
  const isActive = !!selected;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-1.5 rounded-[6px] border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
          isActive
            ? "border-primary bg-primary/10 text-foreground font-semibold ring-1 ring-inset ring-primary/40"
            : "border-border bg-[hsl(var(--card))] text-muted-foreground hover:border-primary/40 hover:text-foreground",
        )}
      >
        {label}
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1.5 z-50 min-w-[160px] rounded-[6px] border border-border bg-[hsl(var(--card))] shadow-lg overflow-hidden">
            {isActive && (
              <button
                onClick={() => { onSelect(field.key, ""); setOpen(false); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-muted-foreground hover:bg-[hsl(var(--accent))] cursor-pointer border-b border-border"
              >
                <X className="h-3 w-3" />
                Clear filter
              </button>
            )}
            {field.options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { onSelect(field.key, opt.value); setOpen(false); }}
                className={cn(
                  "block w-full text-left px-3 py-2 text-xs cursor-pointer transition-colors",
                  selected === opt.value
                    ? "bg-primary/10 text-foreground font-semibold"
                    : "text-foreground hover:bg-[hsl(var(--accent))]",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function FilterPanel({ fields, value, onChange, className }: FilterPanelProps) {
  const activeCount = Object.values(value).filter(Boolean).length;

  const handleSelect = (key: string, val: string) => {
    const next = { ...value };
    if (val) next[key] = val;
    else delete next[key];
    onChange(next);
  };

  const clearAll = () => onChange({});

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
        <SlidersHorizontal className="h-3.5 w-3.5" />
        <span className="font-medium">Filters</span>
        {activeCount > 0 && (
          <span className="rounded-full bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 leading-none">
            {activeCount}
          </span>
        )}
      </div>

      {fields.map((field) => (
        <FilterDropdown
          key={field.key}
          field={field}
          selected={value[field.key] ?? ""}
          onSelect={handleSelect}
        />
      ))}

      {activeCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearAll}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
          Clear all
        </Button>
      )}
    </div>
  );
}
