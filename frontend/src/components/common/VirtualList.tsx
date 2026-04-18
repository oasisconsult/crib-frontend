"use client";

import React, { useRef, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/utils/cn";

export interface VirtualListProps<T> {
  items: T[];
  estimateSize?: number;
  overscan?: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  getItemKey: (item: T, index: number) => string;
  className?: string;
  height?: string | number;
  itemHeight?: number;
  horizontal?: boolean;
  gap?: number;
  emptyState?: React.ReactNode;
  loading?: boolean;
  loadingSkeleton?: React.ReactNode;
  onItemClick?: (item: T, index: number) => void;
}

export function VirtualList<T>({
  items,
  estimateSize = 50,
  overscan = 5,
  renderItem,
  getItemKey,
  className,
  height = "400px",
  itemHeight,
  horizontal = false,
  gap = 0,
  emptyState,
  loading = false,
  loadingSkeleton,
  onItemClick,
}: VirtualListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => itemHeight || estimateSize,
    overscan,
    enabled: !loading && items.length > 0,
  });

  const totalSize = useMemo(() => {
    if (itemHeight) {
      return items.length * itemHeight + (items.length - 1) * gap;
    }
    return virtualizer.getTotalSize();
  }, [itemHeight, items.length, gap, virtualizer]);

  if (loading) {
    return (
      <div 
        ref={parentRef}
        className={cn("overflow-auto", className)}
        style={{ height }}
      >
        {loadingSkeleton || (
          <div className="p-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 skeleton-shimmer rounded" />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (items.length === 0 && emptyState) {
    return (
      <div 
        ref={parentRef}
        className={cn("overflow-auto flex items-center justify-center", className)}
        style={{ height }}
      >
        {emptyState}
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className={cn("overflow-auto", className)}
      style={{ height }}
    >
      <div
        style={{
          height: `${totalSize}px`,
          width: horizontal ? `${totalSize}px` : "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const item = items[virtualItem.index];
          if (!item) return null;

          return (
            <div
              key={getItemKey(item, virtualItem.index)}
              style={{
                position: "absolute",
                top: horizontal ? 0 : virtualItem.start,
                left: horizontal ? virtualItem.start : 0,
                width: horizontal ? `${virtualItem.size}px` : "100%",
                height: horizontal ? "100%" : `${virtualItem.size}px`,
                marginBottom: gap > 0 && !horizontal ? gap : undefined,
                marginRight: gap > 0 && horizontal ? gap : undefined,
              }}
              onClick={() => onItemClick?.(item, virtualItem.index)}
              className={onItemClick ? "cursor-pointer" : undefined}
            >
              {renderItem(item, virtualItem.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Virtual Grid component for 2D virtualization
export interface VirtualGridProps<T> {
  items: T[];
  columns: number;
  itemHeight?: number;
  itemWidth?: number;
  gap?: number;
  estimateSize?: number;
  overscan?: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  getItemKey: (item: T, index: number) => string;
  className?: string;
  height?: string | number;
  emptyState?: React.ReactNode;
  loading?: boolean;
  loadingSkeleton?: React.ReactNode;
}

export function VirtualGrid<T>({
  items,
  columns,
  itemHeight = 200,
  itemWidth = 300,
  gap = 16,
  estimateSize = 200,
  overscan = 5,
  renderItem,
  getItemKey,
  className,
  height = "400px",
  emptyState,
  loading = false,
  loadingSkeleton,
}: VirtualGridProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowCount = Math.ceil(items.length / columns);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => itemHeight + gap,
    overscan,
    enabled: !loading && items.length > 0,
  });

  if (loading) {
    return (
      <div 
        ref={parentRef}
        className={cn("overflow-auto", className)}
        style={{ height }}
      >
        {loadingSkeleton || (
          <div className="p-4 grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-48 skeleton-shimmer rounded-lg" />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (items.length === 0 && emptyState) {
    return (
      <div 
        ref={parentRef}
        className={cn("overflow-auto flex items-center justify-center", className)}
        style={{ height }}
      >
        {emptyState}
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className={cn("overflow-auto", className)}
      style={{ height }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const startIndex = virtualRow.index * columns;
          const endIndex = Math.min(startIndex + columns, items.length);
          const rowItems = items.slice(startIndex, endIndex);

          return (
            <div
              key={`row-${virtualRow.index}`}
              style={{
                position: "absolute",
                top: virtualRow.start,
                left: 0,
                width: "100%",
                height: `${itemHeight}px`,
                display: "grid",
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                gap: `${gap}px`,
                padding: `${gap / 2}px`,
              }}
            >
              {rowItems.map((item, colIndex) => (
                <div key={getItemKey(item, startIndex + colIndex)}>
                  {renderItem(item, startIndex + colIndex)}
                </div>
              ))}
              {/* Fill empty cells to maintain grid layout */}
              {rowItems.length < columns && 
                Array.from({ length: columns - rowItems.length }).map((_, emptyIndex) => (
                  <div key={`empty-${startIndex + rowItems.length + emptyIndex}`} />
                ))
              }
            </div>
          );
        })}
      </div>
    </div>
  );
}
