"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/utils/cn";

const Select = SelectPrimitive.Root;
const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

/* ── Trigger — same proportions as Input ────────────────────────────────── */
const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> & {
    error?: boolean;
  }
>(({ className, children, error, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "flex h-10 w-full items-center justify-between gap-2",
      "rounded-[var(--radius-md)] border border-[hsl(var(--border))] bg-[hsl(var(--input))]",
      "px-3 text-sm text-[hsl(var(--foreground))]",
      "transition-[border-color,box-shadow] duration-150",
      "placeholder:text-[hsl(var(--muted-foreground))]/50",
      // WCAG 2.4.7 — visible focus indicator
      "focus:outline-none focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--ring))]/20",
      "disabled:cursor-not-allowed disabled:bg-[hsl(var(--muted))] disabled:text-[hsl(var(--muted-foreground))]",
      "data-[placeholder]:text-[hsl(var(--muted-foreground))]/60",
      "[&>span]:line-clamp-1",
      error &&
        "border-[hsl(var(--destructive))] focus:border-[hsl(var(--destructive))] focus:ring-[hsl(var(--destructive))]/20",
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown
        className="h-3.5 w-3.5 text-muted-foreground shrink-0"
        aria-hidden="true"
      />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

/* ── Scroll buttons ─────────────────────────────────────────────────────── */
const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn(
      "flex cursor-default items-center justify-center py-1 text-muted-foreground",
      className,
    )}
    {...props}
  >
    <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
  </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn(
      "flex cursor-default items-center justify-center py-1 text-muted-foreground",
      className,
    )}
    {...props}
  >
    <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
  </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName =
  SelectPrimitive.ScrollDownButton.displayName;

/* ── Dropdown panel ─────────────────────────────────────────────────────── */
const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        "relative z-50 max-h-80 min-w-[8rem] overflow-hidden",
        "rounded-[10px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))]",
        "shadow-[0_4px_16px_rgba(15,23,42,0.10),0_1px_4px_rgba(15,23,42,0.06)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.4)]",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        "data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1",
        className,
      )}
      position={position}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport
        className={cn(
          "p-1",
          position === "popper" &&
            "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]",
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

/* ── Group label ────────────────────────────────────────────────────────── */
const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn(
      "px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
      className,
    )}
    {...props}
  />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

/* ── Option item ────────────────────────────────────────────────────────── */
const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-default select-none items-center",
      "rounded-[6px] py-2 pl-3 pr-8 text-sm text-foreground",
      "outline-none transition-colors",
      "data-[highlighted]:bg-emerald-50 data-[highlighted]:text-emerald-700 dark:data-[highlighted]:bg-emerald-950/30 dark:data-[highlighted]:text-emerald-400",
      "data-[state=checked]:text-emerald-700 dark:data-[state=checked]:text-emerald-400 data-[state=checked]:font-medium",
      "data-[highlighted]:data-[state=checked]:bg-emerald-50 dark:data-[highlighted]:data-[state=checked]:bg-emerald-950/30",
      "data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
      className,
    )}
    {...props}
  >
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    <span
      className="absolute right-2.5 flex h-3.5 w-3.5 items-center justify-center text-emerald-600 dark:text-emerald-400"
      aria-hidden="true"
    >
      <SelectPrimitive.ItemIndicator>
        <Check className="h-3.5 w-3.5" />
      </SelectPrimitive.ItemIndicator>
    </span>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
