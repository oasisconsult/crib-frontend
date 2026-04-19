"use client";

import { forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { Loader2 } from "lucide-react";

export interface CurvedButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "destructive" | "outline";
  size?: "sm" | "default" | "lg";
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
  fullWidth?: boolean;
  curve?: "pill" | "medium" | "subtle" | "custom";
  asChild?: boolean;
}

const CurvedButton = forwardRef<HTMLButtonElement, CurvedButtonProps>(
  ({ 
    className, 
    variant = "primary", 
    size = "default", 
    loading = false,
    icon,
    iconPosition = "left",
    fullWidth = false,
    curve = "pill",
    asChild = false,
    children,
    disabled,
    ...props 
  }, ref) => {
    const getCurveClass = () => {
      switch (curve) {
        case "pill":
          return variant === "primary" ? "rounded-full" : "rounded-full";
        case "medium":
          return "rounded-[8px]";
        case "subtle":
          return "rounded-[6px]";
        case "custom":
          return "rounded-[12px]";
        default:
          return "rounded-full";
      }
    };

    const getVariantClass = () => {
      switch (variant) {
        case "primary":
          return cn(
            "re-button-primary",
            "bg-gradient-to-r from-blue-600 to-blue-700",
            "text-white",
            "border-0",
            "shadow-lg hover:shadow-xl",
            "hover:from-blue-700 hover:to-blue-800",
            "active:scale-95",
            "transition-all duration-200 ease-out"
          );
        case "secondary":
          return cn(
            "re-button-secondary",
            "bg-white",
            "text-gray-700",
            "border-2 border-gray-200",
            "hover:border-blue-300",
            "hover:bg-gray-50",
            "active:scale-95",
            "transition-all duration-200 ease-out"
          );
        case "ghost":
          return cn(
            "re-button-ghost",
            "text-gray-600",
            "hover:text-blue-600",
            "hover:bg-blue-50",
            "active:scale-95",
            "transition-all duration-150 ease-out"
          );
        case "destructive":
          return cn(
            "re-button-destructive",
            "bg-gradient-to-r from-red-500 to-red-600",
            "text-white",
            "border-0",
            "shadow-lg hover:shadow-xl",
            "hover:from-red-600 hover:to-red-700",
            "active:scale-95",
            "transition-all duration-200 ease-out"
          );
        case "outline":
          return cn(
            "re-button-secondary",
            "bg-transparent",
            "text-blue-600",
            "border-2 border-blue-600",
            "hover:bg-blue-600",
            "hover:text-white",
            "active:scale-95",
            "transition-all duration-200 ease-out"
          );
        default:
          return cn(
            "re-button-primary",
            "bg-gradient-to-r from-blue-600 to-blue-700",
            "text-white",
            "border-0",
            "shadow-lg hover:shadow-xl",
            "hover:from-blue-700 hover:to-blue-800",
            "active:scale-95",
            "transition-all duration-200 ease-out"
          );
      }
    };

    const getSizeClass = () => {
      switch (size) {
        case "sm":
          return "px-4 py-2 text-sm font-medium";
        case "lg":
          return "px-8 py-4 text-lg font-semibold";
        default:
          return "px-6 py-3 text-sm font-semibold";
      }
    };

    const renderContent = () => {
      if (loading) {
        return (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {children && <span className="ml-2">{children}</span>}
          </>
        );
      }

      if (icon && iconPosition === "left") {
        return (
          <>
            <span className="flex-shrink-0">{icon}</span>
            {children && <span className="ml-2">{children}</span>}
          </>
        );
      }

      if (icon && iconPosition === "right") {
        return (
          <>
            {children && <span className="mr-2">{children}</span>}
            <span className="flex-shrink-0">{icon}</span>
          </>
        );
      }

      return children;
    };

    if (asChild) {
      return (
        <div ref={ref as React.Ref<HTMLDivElement>} className={cn(
          "inline-flex",
          getCurveClass(),
          getVariantClass(),
          getSizeClass(),
          fullWidth && "w-full",
          disabled && "opacity-50 cursor-not-allowed",
          className
        )}>
          <div className="flex items-center justify-center">
            {renderContent()}
          </div>
        </div>
      );
    }

    return (
      <Button
        ref={ref}
        className={cn(
          getCurveClass(),
          getVariantClass(),
          getSizeClass(),
          fullWidth && "w-full",
          disabled && "opacity-50 cursor-not-allowed",
          className
        )}
        disabled={disabled || loading}
        {...props}
      >
        <div className="flex items-center justify-center">
          {renderContent()}
        </div>
      </Button>
    );
  }
);

CurvedButton.displayName = "CurvedButton";

// Specialized CTA Button Component
export function CTAButton({ 
  children, 
  className, 
  size = "lg", 
  ...props 
}: Omit<CurvedButtonProps, "variant" | "curve">) {
  return (
    <CurvedButton
      variant="primary"
      curve="pill"
      size={size}
      className={cn(
        "relative overflow-hidden group",
        "before:absolute before:inset-0 before:bg-gradient-to-r before:from-white/20 before:to-transparent before:opacity-0 before:transition-opacity before:duration-300",
        "hover:before:opacity-100",
        className
      )}
      {...props}
    >
      <span className="relative z-10">{children}</span>
    </CurvedButton>
  );
}

// Icon Button Component
export function IconButton({ 
  children, 
  className, 
  size = "default", 
  variant = "ghost",
  ...props 
}: Omit<CurvedButtonProps, "curve">) {
  const sizeClasses = {
    sm: "p-2",
    default: "p-3",
    lg: "p-4"
  };

  return (
    <CurvedButton
      variant={variant}
      curve="medium"
      size={size}
      className={cn(
        "re-button-icon",
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {children}
    </CurvedButton>
  );
}

// Floating Action Button
export function FloatingActionButton({ 
  children, 
  className, 
  ...props 
}: Omit<CurvedButtonProps, "variant" | "size" | "curve">) {
  return (
    <CurvedButton
      variant="primary"
      curve="pill"
      size="lg"
      className={cn(
        "fixed bottom-6 right-6 z-50",
        "w-14 h-14 p-0 rounded-full",
        "shadow-2xl hover:shadow-3xl",
        "bg-gradient-to-r from-blue-600 to-[#028391]",
        "hover:from-blue-700 hover:to-teal-700",
        className
      )}
      {...props}
    >
      {children}
    </CurvedButton>
  );
}

export default CurvedButton;
