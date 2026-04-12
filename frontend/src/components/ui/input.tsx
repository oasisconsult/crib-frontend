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
  "border border-[#E2E8F0]",
  "bg-white",
  "px-3",
  "text-sm text-[#0F172A]",
  "placeholder:text-[#94A3B8]",
  "transition-[border-color,box-shadow] duration-150",
  "focus-visible:outline-none",
  "focus-visible:border-[#0062FF]",
  "focus-visible:ring-2 focus-visible:ring-[#0062FF]/10",
  "disabled:cursor-not-allowed disabled:bg-[#F8FAFC] disabled:text-[#94A3B8] disabled:border-[#E2E8F0]",
  "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-[#0F172A]",
].join(" ");

const inputError = "border-[#DC2626] focus-visible:border-[#DC2626] focus-visible:ring-[#DC2626]/10";

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, leftIcon, rightIcon, error, ...props }, ref) => {
    if (leftIcon || rightIcon) {
      return (
        <div className="relative flex items-center">
          {leftIcon && (
            <span className="pointer-events-none absolute left-3 flex items-center text-[#94A3B8] [&>svg]:size-4">
              {leftIcon}
            </span>
          )}
          <input
            type={type}
            className={cn(inputBase, error && inputError, leftIcon && "pl-9", rightIcon && "pr-9", className)}
            ref={ref}
            aria-invalid={error}
            {...props}
          />
          {rightIcon && (
            <span className="absolute right-3 flex items-center text-[#94A3B8] [&>svg]:size-4">
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
        aria-invalid={error}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
