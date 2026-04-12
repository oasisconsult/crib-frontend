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
 * PageHeader
 *
 * Drop this at the top of every page route so all pages share the same
 * typography and spacing contract. Never hard-code h1 + p tags in page files.
 *
 * @example
 * <PageHeader
 *   title="Properties"
 *   description="24 properties in your portfolio"
 *   actions={<Button><Plus className="h-4 w-4" /> Add Property</Button>}
 * />
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
        <div className="flex items-center gap-1.5 text-xs text-[#94A3B8] mb-1">
          {breadcrumb}
        </div>
      )}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1
            className="text-[20px] font-semibold tracking-[-0.02em] text-[#0F172A] leading-tight"
            style={{ fontFamily: "var(--font-poppins, 'Poppins', system-ui, sans-serif)" }}
          >
            {title}
          </h1>
          {description && (
            <p className="text-sm text-[#64748B] leading-snug">{description}</p>
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
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-[#94A3B8]">
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
        className="hover:text-[#64748B] transition-colors"
      >
        {children}
      </a>
    );
  }
  return <span className="text-[#0F172A] font-medium">{children}</span>;
}

export function BreadcrumbSeparator() {
  return <span className="text-[#CBD5E1]">/</span>;
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
        <h2 className="text-sm font-semibold text-[#0F172A] tracking-[-0.01em]">{title}</h2>
        {description && (
          <p className="text-xs text-[#64748B] mt-0.5">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
