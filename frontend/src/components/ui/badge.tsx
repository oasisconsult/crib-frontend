import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/utils/cn";

const badgeVariants = cva(
  // Base
  [
    "inline-flex items-center gap-1",
    "rounded-[4px]",
    "px-2 py-0.5",
    "text-[11px] font-semibold leading-snug",
    "whitespace-nowrap",
    "border border-transparent",
    "transition-colors",
  ].join(" "),
  {
    variants: {
      variant: {
        // ── Solid colour fills ──────────────────────────────────────────
        default:     "bg-[#0062FF] text-white",
        secondary:   "bg-[#F1F5F9] text-[#64748B] border-[#E2E8F0]",
        destructive: "bg-[#DC2626] text-white",
        outline:     "bg-transparent text-[#0F172A] border-[#E2E8F0]",

        // ── Semantic tinted badges ──────────────────────────────────────
        success: "bg-[#ECFDF5] text-[#059669] border-[#A7F3D0]",
        warning: "bg-[#FFFBEB] text-[#D97706] border-[#FCD34D]",
        info:    "bg-[#F0F9FF] text-[#0284C7] border-[#BAE6FD]",
        purple:  "bg-[#F5F3FF] text-[#7C3AED] border-[#DDD6FE]",
        slate:   "bg-[#F8FAFC] text-[#64748B] border-[#E2E8F0]",
        primary: "bg-[#EEF4FF] text-[#0062FF] border-[#C7DAFF]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
