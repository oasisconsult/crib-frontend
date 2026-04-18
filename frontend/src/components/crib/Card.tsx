"use client";

// import { motion } from "framer-motion";
import { useTheme } from "@/contexts/ThemeContext";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}

export function Card({ children, className = "", hover = true }: CardProps) {
  const { resolved } = useTheme();

  return (
    <div
      className={`
        bg-card text-card-foreground
        border border-border
        rounded-[8px] p-6
        shadow-sm
        ${hover ? "hover:shadow-md transition-shadow duration-200" : ""}
        ${className}
      `}
    >
      {children}
    </div>
  );
}
