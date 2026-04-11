"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

// Enhanced color palette with better contrast ratios
export const dashboardColors = {
  // Primary colors with WCAG AA compliance
  primary: {
    50: "#f0f9ff",
    100: "#e0f2fe", 
    200: "#bae6fd",
    300: "#7dd3fc",
    400: "#38bdf8",
    500: "#0ea5e9",
    600: "#0284c7",
    700: "#0369a1",
    800: "#075985",
    900: "#0c4a6e",
    950: "#082f49"
  },
  
  // Success colors
  success: {
    50: "#f0fdf4",
    100: "#dcfce7",
    200: "#bbf7d0",
    300: "#86efac",
    400: "#4ade80",
    500: "#22c55e",
    600: "#16a34a",
    700: "#15803d",
    800: "#166534",
    900: "#14532d",
    950: "#052e16"
  },
  
  // Warning colors
  warning: {
    50: "#fffbeb",
    100: "#fef3c7",
    200: "#fde68a",
    300: "#fcd34d",
    400: "#fbbf24",
    500: "#f59e0b",
    600: "#d97706",
    700: "#b45309",
    800: "#92400e",
    900: "#78350f",
    950: "#451a03"
  },
  
  // Error colors
  error: {
    50: "#fef2f2",
    100: "#fee2e2",
    200: "#fecaca",
    300: "#fca5a5",
    400: "#f87171",
    500: "#ef4444",
    600: "#dc2626",
    700: "#b91c1c",
    800: "#991b1b",
    900: "#7f1d1d",
    950: "#450a0a"
  },
  
  // Neutral colors for better contrast
  neutral: {
    50: "#fafafa",
    100: "#f5f5f5",
    200: "#e5e5e5",
    300: "#d4d4d4",
    400: "#a3a3a3",
    500: "#737373",
    600: "#525252",
    700: "#404040",
    800: "#262626",
    900: "#171717",
    950: "#0a0a0a"
  }
};

// Accessible color variants for different states
export const colorVariants = {
  revenue: {
    bg: dashboardColors.primary[50],
    text: dashboardColors.primary[700],
    icon: dashboardColors.primary[600],
    border: dashboardColors.primary[200]
  },
  occupancy: {
    bg: dashboardColors.success[50],
    text: dashboardColors.success[700],
    icon: dashboardColors.success[600],
    border: dashboardColors.success[200]
  },
  tenants: {
    bg: dashboardColors.warning[50],
    text: dashboardColors.warning[700],
    icon: dashboardColors.warning[600],
    border: dashboardColors.warning[200]
  },
  overdue: {
    bg: dashboardColors.error[50],
    text: dashboardColors.error[700],
    icon: dashboardColors.error[600],
    border: dashboardColors.error[200]
  }
};

// Enhanced stat card with accessibility improvements
interface AccessibleStatCardProps {
  title: string;
  value: string;
  trend?: { label: string; positive: boolean };
  progress?: number;
  colorVariant: keyof typeof colorVariants;
  ariaLabel?: string;
}

export function AccessibleStatCard({ 
  title, 
  value, 
  trend, 
  progress, 
  colorVariant,
  ariaLabel 
}: AccessibleStatCardProps) {
  const colors = colorVariants[colorVariant];
  
  return (
    <Card 
      className="hover:shadow-md transition-shadow overflow-hidden focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-primary"
      role="article"
      aria-label={ariaLabel || `${title}: ${value}`}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate">
              {title}
            </p>
            <p className="mt-2 text-2xl font-bold tracking-tight leading-none break-words" aria-live="polite">
              {value}
            </p>
            {trend && (
              <div className={cn(
                "flex items-center gap-1 mt-2 text-xs font-medium",
                trend.positive ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"
              )}>
                <span aria-hidden="true">
                  {trend.positive ? "Trending up" : "Trending down"}
                </span>
                <span className="truncate">{trend.label}</span>
              </div>
            )}
          </div>
          <div 
            className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", colors.bg)}
            aria-hidden="true"
          >
            {/* Icon would go here */}
          </div>
        </div>
        {progress !== undefined && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Progress</span>
              <span aria-label={`Progress: ${progress} percent`}>{progress}%</span>
            </div>
            <div 
              className="h-1.5 w-full rounded-full bg-muted overflow-hidden"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Progress: ${progress}% complete`}
            >
              <div
                className={cn("h-full rounded-full transition-all", 
                  progress >= 80 ? "bg-emerald-500" : progress >= 60 ? "bg-amber-500" : "bg-red-500"
                )}
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Accessible badge with proper ARIA labels
interface AccessibleBadgeProps {
  children: React.ReactNode;
  variant?: "default" | "secondary" | "destructive" | "outline" | "success" | "warning";
  ariaLabel?: string;
}

export function AccessibleBadge({ children, variant = "default", ariaLabel }: AccessibleBadgeProps) {
  const variantClasses = {
    default: "bg-primary text-primary-foreground",
    secondary: "bg-secondary text-secondary-foreground",
    destructive: "bg-destructive text-destructive-foreground",
    outline: "border border-input bg-background text-foreground",
    success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    warning: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
  };

  return (
    <Badge 
      className={variantClasses[variant]}
      aria-label={ariaLabel}
      role="status"
    >
      {children}
    </Badge>
  );
}

// High contrast theme support
export const highContrastTheme = {
  card: "border-2 border-border",
  text: "text-foreground",
  muted: "text-muted-foreground",
  background: "bg-background",
  focus: "ring-2 ring-offset-2 ring-primary"
};

// Screen reader only content
export function ScreenReaderOnly({ children }: { children: React.ReactNode }) {
  return (
    <span className="sr-only">
      {children}
    </span>
  );
}

// Skip to main content link for accessibility
export function SkipToMain() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-primary text-primary-foreground px-4 py-2 rounded-md z-50"
    >
      Skip to main content
    </a>
  );
}

// Focus visible styles for keyboard navigation
export const focusVisibleStyles = "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary";

// Accessible button with proper ARIA support
interface AccessibleButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive";
  size?: "sm" | "default" | "lg";
}

export function AccessibleButton({ 
  children, 
  onClick, 
  disabled = false, 
  ariaLabel, 
  ariaDescribedBy,
  variant = "default",
  size = "default"
}: AccessibleButtonProps) {
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      variant={variant}
      size={size}
      className={focusVisibleStyles}
    >
      {children}
    </Button>
  );
}

// Accessible table with proper headers
interface AccessibleTableProps {
  headers: Array<{
    id: string;
    label: string;
    sortable?: boolean;
  }>;
  rows: Array<{
    id: string;
    cells: Array<{
      value: string;
      ariaLabel?: string;
    }>;
  }>;
  onSort?: (columnId: string) => void;
}

export function AccessibleTable({ headers, rows, onSort }: AccessibleTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse" role="table">
        <thead>
          <tr role="row">
            {headers.map((header) => (
              <th
                key={header.id}
                scope="col"
                className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider border-b"
                aria-sort={onSort ? "none" : undefined}
              >
                {header.sortable && onSort ? (
                  <button
                    onClick={() => onSort(header.id)}
                    className="flex items-center gap-1 hover:text-foreground transition-colors"
                    aria-label={`Sort by ${header.label}`}
                  >
                    {header.label}
                    <span aria-hidden="true">...</span>
                  </button>
                ) : (
                  header.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.map((row) => (
            <tr key={row.id} role="row" className="hover:bg-muted/30 transition-colors">
              {row.cells.map((cell, index) => (
                <td
                  key={index}
                  className="px-4 py-3 text-sm border-b"
                  aria-label={cell.ariaLabel}
                >
                  {cell.value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Color blind friendly palette
export const colorBlindFriendlyColors = {
  blue: "#2563eb",
  orange: "#ea580c",
  green: "#16a34a",
  purple: "#9333ea",
  pink: "#db2777",
  teal: "#0d9488"
};

// Reduced motion support
export const reducedMotionStyles = {
  transition: "transition-none",
  animation: "animate-none"
};
