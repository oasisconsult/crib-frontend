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
  "border border-[hsl(var(--border))]",
  "bg-[hsl(var(--input))]",
  "px-3",
  "text-sm text-[hsl(var(--foreground))]",
  "placeholder:text-[hsl(var(--muted-foreground))]/60",
  "transition-[border-color,box-shadow] duration-150",
  // WCAG 2.4.7 — visible focus indicator
  "focus-visible:outline-none",
  "focus-visible:border-[hsl(var(--primary))]",
  "focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]/20",
  // Disabled state
  "disabled:cursor-not-allowed disabled:bg-[hsl(var(--muted))] disabled:text-[hsl(var(--muted-foreground))] disabled:border-[hsl(var(--border))]",
  "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-[hsl(var(--foreground))]",
].join(" ");

// WCAG 1.3.1 — error state uses both color AND border change (not color alone)
const inputError = "border-[hsl(var(--destructive))] focus-visible:border-[hsl(var(--destructive))] focus-visible:ring-[hsl(var(--destructive))]/20";

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
