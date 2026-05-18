import * as React from "react";
import { cn } from "@/utils/cn";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => (
    <textarea
      className={cn(
        "flex min-h-[96px] w-full",
        "rounded-[var(--radius-md)]",
        "border border-[hsl(var(--border))]",
        "bg-[hsl(var(--input))]",
        "px-3 py-2.5",
        "text-sm text-[hsl(var(--foreground))]",
        "placeholder:text-[hsl(var(--muted-foreground))]/50",
        "resize-y",
        "transition-[border-color,box-shadow] duration-150",
        // WCAG 2.4.7 — visible focus indicator
        "focus-visible:outline-none",
        "focus-visible:border-[hsl(var(--primary))]",
        "focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]/20",
        "disabled:cursor-not-allowed disabled:bg-[hsl(var(--muted))] disabled:text-[hsl(var(--muted-foreground))]",
        // WCAG 1.3.1 — error uses border change + aria-invalid, not colour alone
        error && "border-[hsl(var(--destructive))] focus-visible:border-[hsl(var(--destructive))] focus-visible:ring-[hsl(var(--destructive))]/20",
        className,
      )}
      ref={ref}
      aria-invalid={error || undefined}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export { Textarea };
