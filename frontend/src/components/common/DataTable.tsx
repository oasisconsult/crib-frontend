"use client";

import { useState, useMemo } from "react";
import React from "react";
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";
import { EmptyState } from "./EmptyState";

export interface Column<T> {
  key: keyof T | string;
  header: string;
  sortable?: boolean;
  width?: string;
  className?: string;
  render?: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  loading?: boolean;
  pageSize?: number;
  onRowClick?: (row: T) => void;
  rowKey: (row: T) => string;
  selectable?: boolean;
  selectedKeys?: Set<string>;
  onSelectionChange?: (keys: Set<string>) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
  /* ── Server-side pagination ────────────────────────────────────────────
     When onPageChange is provided the component operates in server-side
     mode: data is shown as-is (no client slicing), totalItems drives the
     footer counter, and page navigation calls onPageChange instead of
     updating internal state.
     ─────────────────────────────────────────────────────────────────── */
  totalItems?: number;
  currentPage?: number;
  onPageChange?: (page: number) => void;
}

type SortDir = "asc" | "desc" | null;

function DataTableInner<T extends object>({
  data,
  columns,
  loading,
  pageSize = 20,
  onRowClick,
  rowKey,
  selectable,
  selectedKeys = new Set(),
  onSelectionChange,
  emptyTitle = "No records found",
  emptyDescription,
  className,
  totalItems,
  currentPage: currentPageProp,
  onPageChange,
}: DataTableProps<T>) {
  const isServerSide = typeof onPageChange === "function";

  /* ── Sort (always client-side on visible rows) ──────────────────────── */
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  /* ── Client-side page state (only used in client-side mode) ─────────── */
  const [clientPage, setClientPage] = useState(1);

  const page = isServerSide ? (currentPageProp ?? 1) : clientPage;

  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return data;
    return [...data].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortKey];
      const bv = (b as Record<string, unknown>)[sortKey];
      if (av === bv) return 0;
      const cmp = String(av ?? "").localeCompare(String(bv ?? ""), undefined, {
        numeric: true,
      });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  /* ── Pagination maths ───────────────────────────────────────────────── */
  const total = isServerSide ? (totalItems ?? data.length) : sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const paginated = isServerSide
    ? sorted                                              // backend already sliced
    : sorted.slice((page - 1) * pageSize, page * pageSize);

  const startItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = isServerSide
    ? Math.min(page * pageSize, total)
    : Math.min(page * pageSize, sorted.length);

  const handleSort = (key: string) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortKey(null);
      setSortDir(null);
    }
    if (!isServerSide) setClientPage(1);
  };

  const handlePageChange = (p: number) => {
    if (isServerSide) onPageChange!(p);
    else setClientPage(p);
  };

  const toggleRow = (key: string) => {
    if (!onSelectionChange) return;
    const next = new Set(selectedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onSelectionChange(next);
  };

  const toggleAll = () => {
    if (!onSelectionChange) return;
    const allKeys = paginated.map((r) => rowKey(r));
    const allSelected = allKeys.every((k) => selectedKeys.has(k));
    if (allSelected) {
      const next = new Set(selectedKeys);
      allKeys.forEach((k) => next.delete(k));
      onSelectionChange(next);
    } else {
      const next = new Set(selectedKeys);
      allKeys.forEach((k) => next.add(k));
      onSelectionChange(next);
    }
  };

  if (!loading && data.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  const showPagination = !loading && totalPages > 1;

  return (
    <div className={cn("space-y-3", className)}>
      {/* Table card */}
      <div className="overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[var(--shadow-sm)] transition-shadow duration-200 hover:shadow-[var(--shadow-md)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" role="table">

            {/* Header */}
            <thead>
              <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
                {selectable && (
                  <th className="w-12 px-4 py-3">
                    <input
                      type="checkbox"
                      className="rounded border-[hsl(var(--border))] accent-[hsl(var(--primary))]"
                      checked={
                        paginated.length > 0 &&
                        paginated.every((r) => selectedKeys.has(rowKey(r)))
                      }
                      onChange={toggleAll}
                      aria-label="Select all rows"
                    />
                  </th>
                )}
                {columns.map((col) => (
                  <th
                    key={String(col.key)}
                    className={cn(
                      "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))] whitespace-nowrap select-none",
                      col.sortable &&
                        "cursor-pointer hover:text-[hsl(var(--foreground))] transition-colors",
                      col.className,
                    )}
                    style={col.width ? { width: col.width } : undefined}
                    onClick={
                      col.sortable
                        ? () => handleSort(String(col.key))
                        : undefined
                    }
                    aria-sort={
                      sortKey === String(col.key)
                        ? sortDir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                  >
                    <span className="flex items-center gap-1.5">
                      {col.header}
                      {col.sortable && (
                        <span
                          className={cn(
                            "transition-colors",
                            sortKey === String(col.key)
                              ? "text-[hsl(var(--primary))]"
                              : "text-[hsl(var(--muted-foreground))]/40",
                          )}
                          aria-hidden="true"
                        >
                          {sortKey === String(col.key) ? (
                            sortDir === "asc" ? (
                              <ChevronUp className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5" />
                            )
                          ) : (
                            <ChevronsUpDown className="h-3.5 w-3.5" />
                          )}
                        </span>
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>

            {/* Body */}
            <tbody className="divide-y divide-[hsl(var(--border))]">
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {selectable && (
                        <td className="px-4 py-3.5">
                          <Skeleton className="h-4 w-4" />
                        </td>
                      )}
                      {columns.map((col) => (
                        <td key={String(col.key)} className="px-4 py-3.5">
                          <Skeleton className="h-4 w-full max-w-[160px]" />
                        </td>
                      ))}
                    </tr>
                  ))
                : paginated.map((row, rowIdx) => {
                    const key = rowKey(row);
                    const isSelected = selectedKeys.has(key);
                    return (
                      <tr
                        key={key}
                        className={cn(
                          "transition-colors",
                          rowIdx % 2 === 1 &&
                            !isSelected &&
                            "bg-[hsl(var(--muted))]/30",
                          onRowClick &&
                            "cursor-pointer hover:bg-[hsl(var(--accent))]",
                          isSelected &&
                            "bg-[hsl(var(--accent))] hover:bg-[hsl(var(--accent))]",
                        )}
                        onClick={() => onRowClick?.(row)}
                      >
                        {selectable && (
                          <td
                            className="w-12 px-4 py-3.5"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleRow(key);
                            }}
                          >
                            <input
                              type="checkbox"
                              className="rounded border-[hsl(var(--border))] accent-[hsl(var(--primary))]"
                              checked={isSelected}
                              onChange={() => toggleRow(key)}
                              aria-label={`Select row ${key}`}
                            />
                          </td>
                        )}
                        {columns.map((col) => (
                          <td
                            key={String(col.key)}
                            className={cn(
                              "px-4 py-3.5 text-[hsl(var(--foreground))]",
                              col.className,
                            )}
                          >
                            {col.render
                              ? col.render(row)
                              : String(
                                  (row as Record<string, unknown>)[
                                    String(col.key)
                                  ] ?? "—",
                                )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        {showPagination && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[hsl(var(--border))] bg-[hsl(var(--muted))]/50">
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              {total === 0 ? (
                "No results"
              ) : (
                <>
                  Showing{" "}
                  <span className="font-medium text-[hsl(var(--foreground))]">
                    {startItem}–{endItem}
                  </span>{" "}
                  of{" "}
                  <span className="font-medium text-[hsl(var(--foreground))]">
                    {total.toLocaleString()}
                  </span>{" "}
                  results
                </>
              )}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => handlePageChange(page - 1)}
                disabled={page === 1}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>

              {/* Page number buttons — sliding window of 5 */}
              <div className="flex items-center gap-0.5">
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (page <= 3) {
                    pageNum = i + 1;
                  } else if (page >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = page - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => handlePageChange(pageNum)}
                      className={cn(
                        "h-7 min-w-[28px] px-1.5 rounded-[6px] text-xs font-medium transition-colors",
                        page === pageNum
                          ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                          : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))]",
                      )}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => handlePageChange(page + 1)}
                disabled={page === totalPages}
                aria-label="Next page"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export const DataTable = React.memo(DataTableInner) as typeof DataTableInner;
