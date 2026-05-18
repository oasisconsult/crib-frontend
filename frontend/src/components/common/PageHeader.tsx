import * as React from "react";
import { cn } from "@/utils/cn";

interface PageHeaderProps {
  /** Large display title */
  title: string;
  /** One-liner description shown below the title */
  description?: string;
  /** Right-aligned slot — CTAs, filters, view toggles */
  actions?: React.ReactNode;
  /** Optional breadcrumb area above the title */
  breadcrumb?: React.ReactNode;
  className?: string;
}

/**
 * PageHeader — uniform page title across all dashboard routes.
 *
 * WCAG compliance:
 * - Uses <h1> so screen readers announce the page title (2.4.6 Headings and Labels)
 * - Breadcrumb wrapped in <nav aria-label="Breadcrumb"> (1.3.1 Info and Relationships)
 * - Colour tokens from CSS variables — adapts to dark mode automatically
 */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-1 pb-5", className)}>
      {breadcrumb && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
          {breadcrumb}
        </div>
      )}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1
            className="text-[20px] font-semibold tracking-[-0.02em] text-foreground leading-tight"
          >
            {title}
          </h1>
          {description && (
            <p className="text-sm text-muted-foreground leading-snug">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0 pt-0.5">{actions}</div>
        )}
      </div>
    </div>
  );
}

/* ── Breadcrumb helpers ──────────────────────────────────────────────────── */

export function Breadcrumb({ children }: { children: React.ReactNode }) {
  return (
    // WCAG 1.3.1 — nav landmark with label identifies this as breadcrumb navigation
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {children}
    </nav>
  );
}

export function BreadcrumbItem({
  href,
  children,
}: {
  href?: string;
  children: React.ReactNode;
}) {
  if (href) {
    return (
      <a
        href={href}
        className="hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
      >
        {children}
      </a>
    );
  }
  // Current page — aria-current="page" for screen readers (WCAG 1.3.1)
  return (
    <span className="text-foreground font-medium" aria-current="page">
      {children}
    </span>
  );
}

export function BreadcrumbSeparator() {
  // Decorative — hidden from AT (WCAG 1.1.1)
  return <span className="text-border" aria-hidden="true">/</span>;
}

/* ── Section header — inside cards/panels ───────────────────────────────── */

interface SectionHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function SectionHeader({ title, description, action, className }: SectionHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      <div>
        {/* h2 for card/panel sections — maintains heading hierarchy below h1 PageHeader */}
        <h2 className="text-sm font-semibold text-foreground tracking-[-0.01em]">{title}</h2>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
