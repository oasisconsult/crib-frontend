"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  ChevronDown, 
  ChevronUp, 
  Eye, 
  EyeOff, 
  Download, 
  Filter,
  MoreVertical,
  Copy,
  Share2,
  ExternalLink,
  CheckCircle2
} from "lucide-react";
import { cn } from "@/utils/cn";

// Expandable Card Component
interface ExpandableCardProps {
  title: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  className?: string;
}

export function ExpandableCard({ title, children, defaultExpanded = false, className }: ExpandableCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <Card className={cn("transition-all duration-200 hover:shadow-md", className)}>
      <CardHeader 
        className="pb-3 cursor-pointer select-none"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent 
        className={cn(
          "transition-all duration-200 overflow-hidden",
          isExpanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
        )}
      >
        {children}
      </CardContent>
    </Card>
  );
}

// Animated Stat Card with Hover Effects
interface AnimatedStatCardProps {
  title: string;
  value: string;
  change?: number;
  changeLabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  onClick?: () => void;
}

export function AnimatedStatCard({ 
  title, 
  value, 
  change, 
  changeLabel, 
  icon: Icon, 
  iconBg, 
  iconColor,
  onClick 
}: AnimatedStatCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Card 
      className={cn(
        "cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]",
        onClick && "hover:border-primary/20"
      )}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate">
              {title}
            </p>
            <p className="mt-2 text-2xl font-bold tracking-tight leading-none break-words">
              {value}
            </p>
            {change !== undefined && (
              <div className={cn(
                "flex items-center gap-1 mt-2 text-xs font-medium transition-colors",
                change > 0 ? "text-emerald-600 dark:text-emerald-400" : 
                change < 0 ? "text-red-500 dark:text-red-400" : "text-muted-foreground"
              )}>
                <span className={cn(
                  "transition-transform duration-200",
                  isHovered && "scale-110"
                )}>
                  {change > 0 ? "+" : change < 0 ? "" : ""}{change}%
                </span>
                {changeLabel && <span className="truncate">{changeLabel}</span>}
              </div>
            )}
          </div>
          <div className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-[6px] transition-all duration-200",
            iconBg,
            isHovered && "scale-110 shadow-md"
          )}>
            <Icon className={cn("h-5 w-5 transition-transform duration-200", iconColor)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Interactive Table Row
interface InteractiveRowProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  hover?: boolean;
}

export function InteractiveRow({ children, onClick, className, hover = true }: InteractiveRowProps) {
  return (
    <div
      className={cn(
        "transition-all duration-200 cursor-pointer",
        hover && "hover:bg-primary/5 hover:shadow-sm",
        onClick && "active:scale-[0.99]",
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

// Animated Badge with Pulse Effect
interface AnimatedBadgeProps {
  children: React.ReactNode;
  variant?: "default" | "secondary" | "destructive" | "outline" | "warning";
  pulse?: boolean;
  className?: string;
}

export function AnimatedBadge({ children, variant = "default", pulse = false, className }: AnimatedBadgeProps) {
  return (
    <Badge 
      variant={variant} 
      className={cn(
        "transition-all duration-200",
        pulse && "animate-pulse",
        variant === "destructive" && "animate-pulse",
        className
      )}
    >
      {children}
    </Badge>
  );
}

// Tooltip wrapper for better UX
interface TooltipWrapperProps {
  children: React.ReactNode;
  content: string;
  position?: "top" | "bottom" | "left" | "right";
}

export function TooltipWrapper({ children, content, position = "top" }: TooltipWrapperProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="relative inline-block">
      <div
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        className="cursor-help"
      >
        {children}
      </div>
      {isVisible && (
        <div className={cn(
          "absolute z-50 px-2 py-1 text-xs text-white bg-gray-900 rounded shadow-lg whitespace-nowrap transition-opacity duration-200",
          position === "top" && "bottom-full left-1/2 transform -translate-x-1/2 mb-1",
          position === "bottom" && "top-full left-1/2 transform -translate-x-1/2 mt-1",
          position === "left" && "right-full top-1/2 transform -translate-y-1/2 mr-1",
          position === "right" && "left-full top-1/2 transform -translate-y-1/2 ml-1"
        )}>
          {content}
          <div className={cn(
            "absolute w-2 h-2 bg-gray-900 transform rotate-45",
            position === "top" && "bottom-full left-1/2 transform -translate-x-1/2 translate-y-1",
            position === "bottom" && "top-full left-1/2 transform -translate-x-1/2 -translate-y-1",
            position === "left" && "right-full top-1/2 transform -translate-y-1/2 translate-x-1",
            position === "right" && "left-full top-1/2 transform -translate-y-1/2 -translate-x-1"
          )} />
        </div>
      )}
    </div>
  );
}

// Action Buttons with Dropdown
interface ActionButtonsProps {
  onView?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onShare?: () => void;
  onExport?: () => void;
  size?: "sm" | "default";
}

export function ActionButtons({ 
  onView, 
  onEdit, 
  onDelete, 
  onShare, 
  onExport, 
  size = "sm" 
}: ActionButtonsProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="flex items-center gap-1">
      {onView && (
        <Button variant="ghost" size={size} onClick={onView} className="h-8 w-8 p-0">
          <Eye className="h-4 w-4" />
        </Button>
      )}
      {onEdit && (
        <Button variant="ghost" size={size} onClick={onEdit} className="h-8 w-8 p-0">
          <Download className="h-4 w-4" />
        </Button>
      )}
      
      <div className="relative">
        <Button 
          variant="ghost" 
          size={size} 
          onClick={() => setIsOpen(!isOpen)}
          className="h-8 w-8 p-0"
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
        
        {isOpen && (
          <div className="absolute right-0 top-full mt-1 w-48 bg-background border rounded-[5px] shadow-lg z-50">
            <div className="py-1">
              {onShare && (
                <button
                  onClick={() => {
                    onShare();
                    setIsOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-primary/5 flex items-center gap-2"
                >
                  <Share2 className="h-4 w-4" />
                  Share
                </button>
              )}
              {onExport && (
                <button
                  onClick={() => {
                    onExport();
                    setIsOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-primary/5 flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  Export
                </button>
              )}
              {onDelete && (
                <button
                  onClick={() => {
                    onDelete();
                    setIsOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-red-50 dark:hover:bg-red-950/30 text-destructive flex items-center gap-2"
                >
                  <EyeOff className="h-4 w-4" />
                  Delete
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Quick Stats Summary with Animation
interface QuickStatsProps {
  stats: Array<{
    label: string;
    value: string;
    color: string;
  }>;
}

export function QuickStats({ stats }: QuickStatsProps) {
  return (
    <div className="flex items-center gap-4 p-4 bg-primary/5 rounded-[6px]">
      {stats.map((stat, index) => (
        <div 
          key={stat.label}
          className="flex items-center gap-2 animate-fade-in"
          style={{ animationDelay: `${index * 100}ms` }}
        >
          <div className={cn("w-2 h-2 rounded-full", stat.color)} />
          <div className="text-xs">
            <div className="text-muted-foreground">{stat.label}</div>
            <div className="font-semibold">{stat.value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Filter Toggle with Animation
interface FilterToggleProps {
  filters: string[];
  activeFilters: string[];
  onToggle: (filter: string) => void;
}

export function FilterToggle({ filters, activeFilters, onToggle }: FilterToggleProps) {
  return (
    <div className="flex items-center gap-2 p-2 bg-primary/5 rounded-[6px] flex-wrap">
      <Filter className="h-4 w-4 text-muted-foreground" />
      {filters.map((filter) => (
        <button
          key={filter}
          onClick={() => onToggle(filter)}
          className={cn(
            "px-3 py-1 text-xs rounded-full transition-all duration-200",
            activeFilters.includes(filter)
              ? "bg-primary/15 text-foreground font-semibold ring-1 ring-inset ring-primary/40"
              : "bg-background text-muted-foreground hover:bg-primary/5 hover:text-foreground"
          )}
        >
          {filter}
        </button>
      ))}
    </div>
  );
}

// Copy to Clipboard with Feedback
interface CopyButtonProps {
  text: string;
  label?: string;
  className?: string;
}

export function CopyButton({ text, label = "Copy", className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleCopy}
      className={cn("gap-2 transition-all duration-200", className)}
    >
      {copied ? (
        <>
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          Copied!
        </>
      ) : (
        <>
          <Copy className="h-4 w-4" />
          {label}
        </>
      )}
    </Button>
  );
}
