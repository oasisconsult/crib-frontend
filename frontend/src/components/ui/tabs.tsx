"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/utils/cn";

const Tabs = TabsPrimitive.Root;

/* ── Tab list — two variants via data attr or className ─────────────────── */
const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & {
    /** "underline" (default) | "pill" */
    variant?: "underline" | "pill";
  }
>(({ className, variant = "underline", ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    data-variant={variant}
    className={cn(
      // ── underline variant (default) ──────────────────────────────────
      variant === "underline" && [
        "flex items-end gap-0",
        "border-b border-[#E2E8F0]",
        "bg-transparent",
      ],
      // ── pill variant ─────────────────────────────────────────────────
      variant === "pill" && [
        "inline-flex items-center gap-1 p-1",
        "rounded-[8px] bg-[#F1F5F9] border border-[#E2E8F0]",
      ],
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

/* ── Tab trigger ────────────────────────────────────────────────────────── */
const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center gap-1.5 whitespace-nowrap",
      "text-sm font-medium text-[#64748B]",
      "transition-all duration-150",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0062FF] focus-visible:ring-offset-1",
      "disabled:pointer-events-none disabled:opacity-40",
      "select-none",

      // ── underline parent ─────────────────────────────────────────────
      // Targets via sibling/parent data attr on the list
      "group-data-[variant=underline]/list:[...]",

      // Default (works with underline TabsList)
      "px-3 py-2.5 -mb-px",
      "border-b-2 border-transparent",
      "hover:text-[#0F172A]",
      "data-[state=active]:border-[#0062FF]",
      "data-[state=active]:text-[#0062FF]",
      "data-[state=active]:font-semibold",

      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

/* ── Pill trigger — override inside pill TabsList ───────────────────────── */
const PillTabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center gap-1.5 whitespace-nowrap",
      "h-7 px-3 rounded-[6px]",
      "text-sm font-medium text-[#64748B]",
      "transition-all duration-150",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0062FF]",
      "disabled:pointer-events-none disabled:opacity-40",
      "hover:text-[#0F172A]",
      "data-[state=active]:bg-white data-[state=active]:text-[#0F172A]",
      "data-[state=active]:shadow-[0_1px_3px_rgba(15,23,42,0.08)]",
      "data-[state=active]:font-semibold",
      className,
    )}
    {...props}
  />
));
PillTabsTrigger.displayName = "PillTabsTrigger";

/* ── Tab panel ──────────────────────────────────────────────────────────── */
const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-4 ring-offset-background",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0062FF] focus-visible:ring-offset-1",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, PillTabsTrigger, TabsContent };
