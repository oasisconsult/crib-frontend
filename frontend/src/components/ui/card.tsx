import * as React from "react";
import { cn } from "@/utils/cn";

/* ── Card shell ─────────────────────────────────────────────────────────── */
const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "bg-white text-card-foreground rounded-[12px] border border-border",
        "shadow-[0_1px_4px_rgba(0,62,255,0.07),0_1px_2px_rgba(15,23,42,0.04)]",
        "dark:bg-card dark:shadow-[0_1px_3px_rgba(0,0,0,0.3),0_1px_2px_rgba(0,0,0,0.2)]",
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "Card";

/* ── Card header — title + optional action ──────────────────────────────── */
const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex items-center justify-between gap-3 px-5 py-4",
        "border-b border-border",
        className,
      )}
      {...props}
    />
  ),
);
CardHeader.displayName = "CardHeader";

/* ── Card title ─────────────────────────────────────────────────────────── */
const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn(
        "text-sm font-semibold text-foreground tracking-[-0.01em]",
        className,
      )}
      {...props}
    />
  ),
);
CardTitle.displayName = "CardTitle";

/* ── Card description / subtitle ────────────────────────────────────────── */
const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn("text-xs text-muted-foreground mt-0.5", className)}
      {...props}
    />
  ),
);
CardDescription.displayName = "CardDescription";

/* ── Card body ──────────────────────────────────────────────────────────── */
const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("px-5 py-4", className)} {...props} />
  ),
);
CardContent.displayName = "CardContent";

/* ── Card footer ────────────────────────────────────────────────────────── */
const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex items-center gap-2 px-5 py-3",
        "border-t border-border bg-muted/40 rounded-b-[12px]",
        className,
      )}
      {...props}
    />
  ),
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
