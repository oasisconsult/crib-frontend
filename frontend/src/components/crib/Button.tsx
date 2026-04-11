"use client";

// import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { cn } from "@/utils/cn";

interface ButtonProps {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
}

export function Button({ 
  children, 
  variant = "primary", 
  size = "md", 
  loading = false, 
  disabled = false,
  className = "",
  onClick,
  type = "button"
}: ButtonProps) {
  const baseClasses = "rounded-xl font-medium transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-primary/50";
  
  const sizeClasses = {
    sm: "h-8 px-3 text-xs",
    md: "h-10 px-4 text-sm", 
    lg: "h-12 px-6 text-base"
  };

  const variantClasses = {
    primary: "bg-primary text-white hover:opacity-90 disabled:opacity-50",
    secondary: "bg-surface-dark border border-border-dark text-text-dark hover:bg-white/5",
    danger: "bg-danger text-white hover:opacity-90 disabled:opacity-50",
    ghost: "text-muted hover:bg-white/5"
  };

  return (
    <button
      type={type}
      className={cn(
        baseClasses,
        sizeClasses[size],
        variantClasses[variant],
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
      onClick={onClick}
      disabled={disabled || loading}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        children
      )}
    </button>
  );
}
