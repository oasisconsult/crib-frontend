import * as React from "react";
import { cn } from "@/utils/cn";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => (
    <textarea
      className={cn(
        "flex min-h-[88px] w-full",
        "rounded-[8px]",
        "border border-[#E2E8F0]",
        "bg-white",
        "px-3 py-2",
        "text-sm text-[#0F172A]",
        "placeholder:text-[#94A3B8]",
        "resize-y",
        "transition-[border-color,box-shadow] duration-150",
        "focus-visible:outline-none",
        "focus-visible:border-[#0062FF]",
        "focus-visible:ring-2 focus-visible:ring-[#0062FF]/10",
        "disabled:cursor-not-allowed disabled:bg-[#F8FAFC] disabled:text-[#94A3B8]",
        error && "border-[#DC2626] focus-visible:border-[#DC2626] focus-visible:ring-[#DC2626]/10",
        className,
      )}
      ref={ref}
      aria-invalid={error}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export { Textarea };
