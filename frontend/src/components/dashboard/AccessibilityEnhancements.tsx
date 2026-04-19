"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

// Modern Real Estate SaaS Color Palette
// Professional, trustworthy, and property-focused color scheme
export const realEstateColors = {
  // Primary Brand - Deep Navy Blue (Professional, Trustworthy)
  primary: {
    50: "#f8fafc",
    100: "#f1f5f9",
    200: "#e2e8f0",
    300: "#cbd5e1",
    400: "#94a3b8",
    500: "#64748b",
    600: "#475569",
    700: "#334155",
    800: "#1e293b",
    900: "#0f172a",
    950: "#020617",
  },

  // Secondary Brand - Slate Blue (Property, Modern)
  secondary: {
    50: "#f8fafc",
    100: "#f1f5f9",
    200: "#e2e8f0",
    300: "#cbd5e1",
    400: "#94a3b8",
    500: "#64748b",
    600: "#475569",
    700: "#334155",
    800: "#1e293b",
    900: "#0f172a",
    950: "#020617",
  },

  // Accent - Emerald Green (Growth, Success, Revenue)
  accent: {
    50: "#ecfdf5",
    100: "#d1fae5",
    200: "#a7f3d0",
    300: "#6ee7b7",
    400: "#34d399",
    500: "#10b981",
    600: "#059669",
    700: "#047857",
    800: "#065f46",
    900: "#064e3b",
    950: "#022c22",
  },

  // Success - Forest Green (Properties, Growth)
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
    950: "#052e16",
  },

  // Warning - Amber (Maintenance, Alerts)
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
    950: "#451a03",
  },

  // Error - Rose (Urgent Issues, Overdue)
  error: {
    50: "#fdf2f8",
    100: "#fce7f3",
    200: "#fbcfe8",
    300: "#f9a8d4",
    400: "#f472b6",
    500: "#ec4899",
    600: "#db2777",
    700: "#be185d",
    800: "#9d174d",
    900: "#831843",
    950: "#500724",
  },

  // Property Blue (Real Estate Focus)
  property: {
    50: "#eff6ff",
    100: "#dbeafe",
    200: "#bfdbfe",
    300: "#93c5fd",
    400: "#60a5fa",
    500: "#3b82f6",
    600: "#2563eb",
    700: "#1d4ed8",
    800: "#1e40af",
    900: "#1e3a8a",
    950: "#172554",
  },

  // Tenant Purple (People, Relationships)
  tenant: {
    50: "#faf5ff",
    100: "#f3e8ff",
    200: "#e9d5ff",
    300: "#d8b4fe",
    400: "#c084fc",
    500: "#a855f7",
    600: "#028391",
    700: "#7c3aed",
    800: "#6b21a8",
    900: "#581c87",
    950: "#3b0764",
  },

  // Revenue Gold (Financial, Premium)
  revenue: {
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
    950: "#451a03",
  },

  // Neutral Grays (Professional Base)
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
    950: "#0a0a0a",
  },

  // Surface Colors (Cards, Backgrounds)
  surface: {
    50: "#ffffff",
    100: "#f8fafc",
    200: "#f1f5f9",
    300: "#e2e8f0",
    400: "#cbd5e1",
    500: "#94a3b8",
    600: "#64748b",
    700: "#475569",
    800: "#334155",
    900: "#1e293b",
    950: "#0f172a",
  },
};

// Real Estate themed color variants for different dashboard metrics
export const realEstateColorVariants = {
  revenue: {
    bg: realEstateColors.revenue[50],
    text: realEstateColors.revenue[700],
    icon: realEstateColors.revenue[600],
    border: realEstateColors.revenue[200],
  },
  occupancy: {
    bg: realEstateColors.property[50],
    text: realEstateColors.property[700],
    icon: realEstateColors.property[600],
    border: realEstateColors.property[200],
  },
  tenants: {
    bg: realEstateColors.tenant[50],
    text: realEstateColors.tenant[700],
    icon: realEstateColors.tenant[600],
    border: realEstateColors.tenant[200],
  },
  overdue: {
    bg: realEstateColors.error[50],
    text: realEstateColors.error[700],
    icon: realEstateColors.error[600],
    border: realEstateColors.error[200],
  },
  maintenance: {
    bg: realEstateColors.warning[50],
    text: realEstateColors.warning[700],
    icon: realEstateColors.warning[600],
    border: realEstateColors.warning[200],
  },
  growth: {
    bg: realEstateColors.accent[50],
    text: realEstateColors.accent[700],
    icon: realEstateColors.accent[600],
    border: realEstateColors.accent[200],
  },
};

// Enhanced stat card with accessibility improvements
interface AccessibleStatCardProps {
  title: string;
  value: string;
  trend?: { label: string; positive: boolean };
  progress?: number;
  colorVariant: keyof typeof realEstateColorVariants;
  ariaLabel?: string;
}

export function AccessibleStatCard({
  title,
  value,
  trend,
  progress,
  colorVariant,
  ariaLabel,
}: AccessibleStatCardProps) {
  const colors = realEstateColorVariants[colorVariant];

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
            <p
              className="mt-2 text-2xl font-bold tracking-tight leading-none break-words"
              aria-live="polite"
            >
              {value}
            </p>
            {trend && (
              <div
                className={cn(
                  "flex items-center gap-1 mt-2 text-xs font-medium",
                  trend.positive
                    ? "text-teal-600 dark:text-teal-400"
                    : "text-red-500 dark:text-red-400",
                )}
              >
                <span aria-hidden="true">
                  {trend.positive ? "Trending up" : "Trending down"}
                </span>
                <span className="truncate">{trend.label}</span>
              </div>
            )}
          </div>
          <div
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-[6px]",
              colors.bg,
            )}
            aria-hidden="true"
          >
            {/* Icon would go here */}
          </div>
        </div>
        {progress !== undefined && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Progress</span>
              <span aria-label={`Progress: ${progress} percent`}>
                {progress}%
              </span>
            </div>
            <div
              className="h-1.5 w-full rounded-full bg-primary/10 overflow-hidden"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Progress: ${progress}% complete`}
            >
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  progress >= 80
                    ? "bg-emerald-500"
                    : progress >= 60
                      ? "bg-amber-500"
                      : "bg-red-500",
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
  variant?:
    | "default"
    | "secondary"
    | "destructive"
    | "outline"
    | "success"
    | "warning";
  ariaLabel?: string;
}

export function AccessibleBadge({
  children,
  variant = "default",
  ariaLabel,
}: AccessibleBadgeProps) {
  const variantClasses = {
    default: "bg-primary text-primary-foreground",
    secondary: "bg-secondary text-secondary-foreground",
    destructive: "bg-destructive text-destructive-foreground",
    outline: "border border-input bg-background text-foreground",
    success:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-100/40 dark:text-emerald-400",
    warning:
      "bg-amber-100 text-amber-800 dark:bg-amber-100/40 dark:text-amber-400",
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
  focus: "ring-2 ring-offset-2 ring-primary",
};

// Screen reader only content
export function ScreenReaderOnly({ children }: { children: React.ReactNode }) {
  return <span className="sr-only">{children}</span>;
}

// Skip to main content link for accessibility
export function SkipToMain() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-primary text-primary-foreground px-4 py-2 rounded-[5px] z-50"
    >
      Skip to main content
    </a>
  );
}

// Focus visible styles for keyboard navigation
export const focusVisibleStyles =
  "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary";

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
  size = "default",
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

export function AccessibleTable({
  headers,
  rows,
  onSort,
}: AccessibleTableProps) {
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
            <tr
              key={row.id}
              role="row"
              className="hover:bg-primary/5 transition-colors"
            >
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
  purple: "#028391",
  pink: "#db2777",
  teal: "#0d9488",
};

// Reduced motion support
export const reducedMotionStyles = {
  transition: "transition-none",
  animation: "animate-none",
};
