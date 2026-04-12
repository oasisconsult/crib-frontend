import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/utils/cn";

const buttonVariants = cva(
  // Base — shared by every variant
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "font-medium text-sm leading-none",
    "rounded-[8px]",
    "border border-transparent",
    "transition-all duration-150 ease-out",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#0062FF]",
    "disabled:pointer-events-none disabled:opacity-40",
    "select-none",
    "[&_svg]:shrink-0 [&_svg]:size-4",
  ].join(" "),
  {
    variants: {
      variant: {
        // ── Primary ── filled blue, the main CTA
        default: [
          "bg-[#0062FF] text-white border-[#0062FF]",
          "hover:bg-[#0052D9] hover:border-[#0052D9]",
          "active:scale-[0.97]",
          "shadow-[0_1px_2px_rgba(0,98,255,0.25)]",
        ].join(" "),

        // ── Destructive ── filled red
        destructive: [
          "bg-[#DC2626] text-white border-[#DC2626]",
          "hover:bg-[#B91C1C] hover:border-[#B91C1C]",
          "active:scale-[0.97]",
        ].join(" "),

        // ── Outline ── bordered, transparent fill
        outline: [
          "bg-transparent text-[#0F172A] border-[#E2E8F0]",
          "hover:bg-[#F8FAFC] hover:border-[#CBD5E1]",
          "active:scale-[0.97]",
        ].join(" "),

        // ── Secondary ── filled muted gray
        secondary: [
          "bg-[#F1F5F9] text-[#0F172A] border-[#E2E8F0]",
          "hover:bg-[#E2E8F0] hover:border-[#CBD5E1]",
          "active:scale-[0.97]",
        ].join(" "),

        // ── Ghost ── no border, appears on hover
        ghost: [
          "bg-transparent text-[#64748B] border-transparent",
          "hover:bg-[#F1F5F9] hover:text-[#0F172A]",
        ].join(" "),

        // ── Link ── looks like an anchor
        link: [
          "bg-transparent text-[#0062FF] border-transparent underline-offset-4",
          "hover:underline",
          "p-0 h-auto",
        ].join(" "),

        // ── Success ──
        success: [
          "bg-[#059669] text-white border-[#059669]",
          "hover:bg-[#047857]",
          "active:scale-[0.97]",
        ].join(" "),

        // ── Warning ──
        warning: [
          "bg-[#D97706] text-white border-[#D97706]",
          "hover:bg-[#B45309]",
          "active:scale-[0.97]",
        ].join(" "),
      },

      size: {
        sm:      "h-8 px-3 text-xs rounded-[6px]",
        default: "h-9 px-4",
        lg:      "h-10 px-5 text-sm",
        xl:      "h-11 px-6 text-sm font-semibold",
        icon:    "h-9 w-9 p-0",
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
        aria-busy={loading}
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
