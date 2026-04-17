"use client";

import { useState, useEffect, useRef } from "react";
import { Search, X, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/utils/cn";

export interface FilterChip {
  key: string;
  label: string;
  value: string;
  displayValue: string;
}

interface FilterBarProps {
  search?: string;
  onSearchChange?: (value: string) => void;
  debounceMs?: number;
  placeholder?: string;
  activeFilters?: FilterChip[];
  onRemoveFilter?: (key: string) => void;
  onClearAll?: () => void;
  children?: React.ReactNode; // filter dropdowns
  className?: string;
}

export function FilterBar({
  search = "",
  onSearchChange,
  debounceMs = 300,
  placeholder = "Search...",
  activeFilters = [],
  onRemoveFilter,
  onClearAll,
  children,
  className,
}: FilterBarProps) {
  const [showFilters, setShowFilters] = useState(false);
  // Local value updates immediately for responsive UI; callback fires after debounce.
  const [localSearch, setLocalSearch] = useState(search);
  const onSearchChangeRef = useRef(onSearchChange);
  useEffect(() => { onSearchChangeRef.current = onSearchChange; });

  useEffect(() => {
    setLocalSearch(search);
  }, [search]);

  useEffect(() => {
    if (!onSearchChangeRef.current) return;
    const id = setTimeout(() => onSearchChangeRef.current?.(localSearch), debounceMs);
    return () => clearTimeout(id);
  }, [localSearch, debounceMs]);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {/* Search */}
        {onSearchChange && (
          <div className="relative flex-1">
            <Input
              leftIcon={<Search className="h-4 w-4" />}
              placeholder={placeholder}
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              className="pl-9"
              aria-label={placeholder}
            />
            {localSearch && (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => { setLocalSearch(""); onSearchChange(""); }}
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Filter toggle */}
        {children && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="shrink-0"
            aria-expanded={showFilters}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {activeFilters.length > 0 && (
              <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                {activeFilters.length}
              </span>
            )}
          </Button>
        )}
      </div>

      {/* Filter panel */}
      {showFilters && children && (
        <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-muted/50 border border-border">
          {children}
        </div>
      )}

      {/* Active filter chips */}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
          {activeFilters.map((filter) => (
            <Badge key={filter.key} variant="secondary" className="gap-1 pr-1">
              <span className="text-muted-foreground">{filter.label}:</span>
              {filter.displayValue}
              <button
                onClick={() => onRemoveFilter?.(filter.key)}
                className="ml-1 rounded-full hover:bg-muted p-0.5"
                aria-label={`Remove ${filter.label} filter`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {onClearAll && (
            <Button variant="ghost" size="sm" onClick={onClearAll} className="h-6 text-xs">
              Clear all
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
