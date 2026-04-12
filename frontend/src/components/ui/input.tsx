import * as React from "react";
import { cn } from "@/utils/cn";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  error?: boolean;
}

const inputBase = [
  "flex w-full",
  "h-9",
  "rounded-[8px]",
  "border border-input",
  "bg-background",
  "px-3",
  "text-sm text-foreground",
  "placeholder:text-muted-foreground/60",
  "transition-[border-color,box-shadow] duration-150",
  // WCAG 2.4.7 — visible focus indicator with ring offset for separation
  "focus-visible:outline-none",
  "focus-visible:border-primary",
  "focus-visible:ring-2 focus-visible:ring-ring/20",
  // Disabled state
  "disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:border-border",
  "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
].join(" ");

// WCAG 1.3.1 — error state uses both color AND border change (not color alone)
const inputError = "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20";

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, leftIcon, rightIcon, error, ...props }, ref) => {
    if (leftIcon || rightIcon) {
      return (
        <div className="relative flex items-center">
          {leftIcon && (
            // aria-hidden — decorative icon; the input's placeholder/label provides the accessible name
            <span className="pointer-events-none absolute left-3 flex items-center text-muted-foreground [&>svg]:size-4" aria-hidden="true">
              {leftIcon}
            </span>
          )}
          <input
            type={type}
            className={cn(inputBase, error && inputError, leftIcon && "pl-9", rightIcon && "pr-9", className)}
            ref={ref}
            aria-invalid={error || undefined}
            {...props}
          />
          {rightIcon && (
            <span className="absolute right-3 flex items-center text-muted-foreground [&>svg]:size-4" aria-hidden="true">
              {rightIcon}
            </span>
          )}
        </div>
      );
    }

    return (
      <input
        type={type}
        className={cn(inputBase, error && inputError, className)}
        ref={ref}
        aria-invalid={error || undefined}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
