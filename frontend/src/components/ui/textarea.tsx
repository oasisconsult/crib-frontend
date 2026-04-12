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
        "border border-input",
        "bg-background",
        "px-3 py-2",
        "text-sm text-foreground",
        "placeholder:text-muted-foreground/60",
        "resize-y",
        "transition-[border-color,box-shadow] duration-150",
        // WCAG 2.4.7 — visible focus indicator
        "focus-visible:outline-none",
        "focus-visible:border-primary",
        "focus-visible:ring-2 focus-visible:ring-ring/20",
        "disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground",
        // WCAG 1.3.1 — error uses border change + aria-invalid, not colour alone
        error && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20",
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
