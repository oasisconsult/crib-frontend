"use client";

import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import { useTheme } from "@/contexts/ThemeContext";

interface InputProps {
  type?: "text" | "email" | "password" | "number";
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
  disabled?: boolean;
  error?: boolean;
  label?: string;
}

export function Input({ 
  type = "text", 
  placeholder, 
  value, 
  onChange, 
  className = "",
  disabled = false,
  error = false,
  label
}: InputProps) {
  const { resolved: theme } = useTheme();

  return (
    <div className="space-y-2">
      {label && (
        <label className="text-xs text-muted uppercase tracking-wide">
          {label}
        </label>
      )}
      <motion.input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
        className={cn(
          `h-10 w-full rounded-xl bg-background-${theme} border border-border-${theme} px-3 text-sm text-text-${theme} placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all duration-300`,
          error && "border-danger focus:ring-danger/50",
          disabled && "opacity-50 cursor-not-allowed",
          className
        )}
        whileFocus={{ scale: 1.01 }}
        transition={{ duration: 0.2 }}
      />
    </div>
  );
}
