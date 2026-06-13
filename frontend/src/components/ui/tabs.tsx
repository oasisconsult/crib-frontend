"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/utils/cn";

const Tabs = TabsPrimitive.Root;

/* ── Tab list ────────────────────────────────────────────────────────────── */
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
      variant === "underline" && [
        "flex items-end gap-0",
        "border-b border-border",
        "bg-transparent",
      ],
      variant === "pill" && [
        "inline-flex items-center gap-1 p-1",
        "rounded-[8px] bg-muted border border-border",
      ],
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

/* ── Tab trigger (underline style) ──────────────────────────────────────── */
const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center gap-1.5 whitespace-nowrap",
      "text-sm font-medium text-muted-foreground",
      "transition-all duration-150",
      // WCAG 2.4.7 — visible focus indicator
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
      "disabled:pointer-events-none disabled:opacity-40",
      "select-none",
      "px-3 py-2.5 -mb-px",
      "border-b-2 border-transparent",
      "hover:text-foreground",
      "data-[state=active]:border-emerald-600 dark:data-[state=active]:border-emerald-500",
      "data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400",
      "data-[state=active]:font-semibold",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

/* ── Pill trigger ────────────────────────────────────────────────────────── */
const PillTabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center gap-1.5 whitespace-nowrap",
      "h-7 px-3 rounded-[6px]",
      "text-sm font-medium text-muted-foreground",
      "transition-all duration-150",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
      "disabled:pointer-events-none disabled:opacity-40",
      "hover:text-foreground",
      "data-[state=active]:bg-card data-[state=active]:text-foreground",
      "data-[state=active]:shadow-[0_1px_3px_rgba(15,23,42,0.08)]",
      "data-[state=active]:font-semibold",
      className,
    )}
    {...props}
  />
));
PillTabsTrigger.displayName = "PillTabsTrigger";

/* ── Sidenav list + trigger — for vertical sidebar-style tab navigation ──── */
const SidenavTabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "flex flex-col shrink-0 bg-transparent gap-0.5 h-auto p-0",
      "border-r border-border",
      className,
    )}
    {...props}
  />
));
SidenavTabsList.displayName = "SidenavTabsList";

const SidenavTabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "w-full flex items-center justify-start gap-2.5",
      "h-9 px-3 rounded-lg",
      "text-sm font-medium text-muted-foreground",
      "transition-all duration-150",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
      "disabled:pointer-events-none disabled:opacity-40",
      "hover:bg-[hsl(var(--sidebar-hover-bg))] hover:text-foreground",
      "data-[state=active]:bg-[hsl(var(--sidebar-active-bg))] data-[state=active]:text-[hsl(var(--sidebar-active-fg))] data-[state=active]:font-semibold",
      className,
    )}
    {...props}
  />
));
SidenavTabsTrigger.displayName = "SidenavTabsTrigger";

/* ── Tab panel ──────────────────────────────────────────────────────────── */
const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-4 ring-offset-background",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, PillTabsTrigger, SidenavTabsList, SidenavTabsTrigger, TabsContent };
