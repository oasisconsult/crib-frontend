import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/utils/cn";

const buttonVariants = cva(
  // ── Base — shared by every variant ──────────────────────────────────────
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "font-medium text-sm leading-none",
    "rounded-[var(--radius)]",
    "border border-transparent",
    "transition-all duration-150 ease-out",
    // WCAG 2.4.7 — visible focus indicator, ring-offset uses bg so it's visible on any surface
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-40",
    "select-none",
    "[&_svg]:shrink-0 [&_svg]:size-4",
  ].join(" "),
  {
    variants: {
      variant: {
        // ── Primary ── teal CTA
        default: [
          "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-[hsl(var(--primary))]",
          "hover:bg-[hsl(var(--primary))]/90 hover:border-[hsl(var(--primary))]/90",
          "active:scale-[0.97]",
          "shadow-[0_1px_3px_rgba(20,198,163,0.30)]",
        ].join(" "),

        // ── Destructive ── filled red
        destructive: [
          "bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] border-[hsl(var(--destructive))]",
          "hover:bg-[hsl(var(--destructive))]/90 hover:border-[hsl(var(--destructive))]/90",
          "active:scale-[0.97]",
        ].join(" "),

        // ── Outline ── bordered, transparent fill
        outline: [
          "bg-transparent text-[hsl(var(--foreground))] border-[hsl(var(--border))]",
          "hover:bg-[hsl(var(--accent))] hover:border-[hsl(var(--primary))]/30 hover:text-[hsl(var(--accent-foreground))]",
          "active:scale-[0.97]",
        ].join(" "),

        // ── Secondary ── light teal wash fill
        secondary: [
          "bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] border-[hsl(var(--secondary))]",
          "hover:bg-[hsl(var(--secondary))]/70 hover:border-[hsl(var(--primary))]/20",
          "active:scale-[0.97]",
        ].join(" "),

        // ── Ghost ── no border, teal on hover
        ghost: [
          "bg-transparent text-[hsl(var(--muted-foreground))] border-transparent",
          "hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))]",
        ].join(" "),

        // ── Link ── looks like an anchor
        link: [
          "bg-transparent text-[hsl(var(--primary))] border-transparent underline-offset-4",
          "hover:underline",
          "p-0 h-auto",
        ].join(" "),

        // ── Success ──
        success: [
          "bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))] border-[hsl(var(--success))]",
          "hover:bg-[hsl(var(--success))]/90 hover:border-[hsl(var(--success))]/90",
          "active:scale-[0.97]",
        ].join(" "),

        // ── Warning ──
        warning: [
          "bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))] border-[hsl(var(--warning))]",
          "hover:bg-[hsl(var(--warning))]/90 hover:border-[hsl(var(--warning))]/90",
          "active:scale-[0.97]",
        ].join(" "),
      },

      size: {
        sm:        "h-8 px-3 text-xs rounded-[6px]",
        default:   "h-9 px-4",
        lg:        "h-10 px-5 text-sm",
        xl:        "h-11 px-6 text-sm font-semibold",
        icon:      "h-9 w-9 p-0",
        "icon-sm": "h-7 w-7 p-0 rounded-[6px]",
        "icon-lg": "h-10 w-10 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {asChild ? children : (
          <>
            {loading && (
              <svg
                className="animate-spin shrink-0"
                style={{ width: "14px", height: "14px" }}
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
