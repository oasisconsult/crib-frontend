"use client";

// import { motion } from "framer-motion";
import { useTheme } from "@/contexts/ThemeContext";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}

export function Card({ children, className = "", hover = true }: CardProps) {
  const { theme } = useTheme();

  return (
    <div
      className={`
        bg-surface-${theme} 
        border border-border-${theme} 
        rounded-2xl p-6 
        shadow-sm
        ${hover ? "hover:bg-white/5 hover:shadow-md transition-all duration-300" : ""}
        ${className}
      `}
    >
      {children}
    </div>
  );
}
