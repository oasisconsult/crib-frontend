"use client";

import React from 'react';
import { cn } from '@/utils/cn';
import { 
  Building, 
  Users, 
  CreditCard, 
  Plus, 
  Search, 
  Filter,
  Download,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  X,
  Info,
  AlertTriangle
} from 'lucide-react';

// ===== EMPTY STATES =====

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
  className?: string;
}

export function EmptyState({ 
  icon, 
  title, 
  description, 
  action, 
  className 
}: EmptyStateProps) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center py-12 px-6 text-center",
      className
    )}>
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        {icon || <AlertCircle className="w-8 h-8 text-gray-400" />}
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600 mb-6 max-w-sm">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-[6px] hover:bg-teal-700 transition-colors"
        >
          {action.icon}
          {action.label}
        </button>
      )}
    </div>
  );
}

// Specific Empty States
export function EmptyPropertiesState({ onAddProperty }: { onAddProperty: () => void }) {
  return (
    <EmptyState
      icon={<Building className="w-8 h-8 text-gray-400" />}
      title="No properties yet"
      description="Get started by adding your first property to begin managing your real estate portfolio."
      action={{
        label: "Add Property",
        onClick: onAddProperty,
        icon: <Plus className="w-4 h-4" />
      }}
    />
  );
}

export function EmptyTenantsState({ onAddTenant }: { onAddTenant: () => void }) {
  return (
    <EmptyState
      icon={<Users className="w-8 h-8 text-gray-400" />}
      title="No tenants yet"
      description="Add your first tenant to start managing rental agreements and payments."
      action={{
        label: "Add Tenant",
        onClick: onAddTenant,
        icon: <Plus className="w-4 h-4" />
      }}
    />
  );
}

export function EmptyPaymentsState({ onRecordPayment }: { onRecordPayment: () => void }) {
  return (
    <EmptyState
      icon={<CreditCard className="w-8 h-8 text-gray-400" />}
      title="No payments recorded"
      description="Start recording payments to track your rental income and payment history."
      action={{
        label: "Record Payment",
        onClick: onRecordPayment,
        icon: <Plus className="w-4 h-4" />
      }}
    />
  );
}

// ===== LOADING STATES =====

interface SkeletonProps {
  className?: string;
  lines?: number;
}

export function Skeleton({ className, lines = 3 }: SkeletonProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "bg-muted rounded animate-pulse",
            i === 0 ? "h-4 w-3/4" : i === lines - 1 ? "h-4 w-1/2" : "h-4 w-full"
          )}
        />
      ))}
    </div>
  );
}

export function CardSkeleton({ className }: SkeletonProps) {
  return (
    <div className={cn("bg-card border border-border rounded-[var(--radius-lg)] p-6", className)}>
      <Skeleton lines={2} />
    </div>
  );
}

export function TableSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("bg-card border border-border rounded-[var(--radius-lg)] overflow-hidden", className)}>
      {/* Table Header */}
      <div className="border-b border-border p-4">
        <div className="h-4 bg-gray-200 rounded w-1/4 animate-pulse" />
      </div>
      
      {/* Table Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="border-b border-border p-4">
          <div className="flex items-center space-x-4">
            <div className="h-4 bg-gray-200 rounded w-1/4 animate-pulse" />
            <div className="h-4 bg-gray-200 rounded w-1/3 animate-pulse" />
            <div className="h-4 bg-gray-200 rounded w-1/6 animate-pulse" />
            <div className="h-4 bg-gray-200 rounded w-1/8 animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DashboardCardSkeleton({ className }: SkeletonProps) {
  return (
    <div className={cn("bg-card border border-border rounded-[var(--radius-lg)] p-6", className)}>
      <div className="space-y-4">
        <div className="h-4 bg-gray-200 rounded w-1/2 animate-pulse" />
        <div className="h-8 bg-gray-200 rounded w-3/4 animate-pulse" />
        <div className="h-4 bg-gray-200 rounded w-1/3 animate-pulse" />
      </div>
    </div>
  );
}

// ===== NOTIFICATIONS =====

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface NotificationToastProps {
  notification: Notification;
  onClose: (id: string) => void;
}

export function NotificationToast({ notification, onClose }: NotificationToastProps) {
  React.useEffect(() => {
    if (notification.duration !== 0) {
      const timer = setTimeout(() => {
        onClose(notification.id);
      }, notification.duration || 5000);
      
      return () => clearTimeout(timer);
    }
  }, [notification.id, notification.duration, onClose]);

  const getIcon = () => {
    switch (notification.type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'info':
        return <Info className="w-5 h-5 text-blue-500" />;
    }
  };

  const getBackgroundColor = () => {
    switch (notification.type) {
      case 'success':
        return 'bg-green-50 border-green-200';
      case 'error':
        return 'bg-red-50 border-red-200';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200';
      case 'info':
        return 'bg-teal-50 border-teal-200';
    }
  };

  return (
    <div
      className={cn(
        "max-w-sm w-full border rounded-[6px] shadow-lg p-4 transition-all duration-300 transform",
        getBackgroundColor()
      )}
    >
      <div className="flex items-start gap-3">
        {getIcon()}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-foreground">{notification.title}</h4>
          {notification.message && (
            <p className="text-sm text-muted-foreground mt-1">{notification.message}</p>
          )}
          {notification.action && (
            <button
              onClick={notification.action.onClick}
              className="text-sm font-medium text-teal-600 hover:text-teal-700 mt-2"
            >
              {notification.action.label}
            </button>
          )}
        </div>
        <button
          onClick={() => onClose(notification.id)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ===== SEARCH AND FILTER COMPONENTS =====

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchBar({ value, onChange, placeholder = "Search...", className }: SearchBarProps) {
  return (
    <div className={cn("relative", className)}>
      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-10 pr-4 py-2 border border-border rounded-[var(--radius-md)] bg-input text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

interface FilterButtonProps {
  activeFilters: number;
  onClick: () => void;
  className?: string;
}

export function FilterButton({ activeFilters, onClick, className }: FilterButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 px-4 py-2 border border-border rounded-[var(--radius-md)] hover:bg-muted text-foreground transition-colors",
        activeFilters > 0 && "bg-teal-50 border-teal-200 text-teal-600",
        className
      )}
    >
      <Filter className="w-4 h-4" />
      Filters
      {activeFilters > 0 && (
        <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded-full">
          {activeFilters}
        </span>
      )}
    </button>
  );
}

interface ActionButtonsProps {
  onExport?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  className?: string;
}

export function ActionButtons({ onExport, onRefresh, isRefreshing = false, className }: ActionButtonsProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {onExport && (
        <button
          onClick={onExport}
          className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-[6px] hover:bg-gray-50 transition-colors"
        >
          <Download className="w-4 h-4" />
          Export
        </button>
      )}
      {onRefresh && (
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-[6px] hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
          Refresh
        </button>
      )}
    </div>
  );
}

// ===== UTILITY COMPONENTS =====

interface StatusBadgeProps {
  status: 'active' | 'inactive' | 'pending' | 'paid' | 'unpaid' | 'overdue';
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'active':
        return { label: 'Active', className: 'bg-green-100 text-green-800' };
      case 'inactive':
        return { label: 'Inactive', className: 'bg-muted text-muted-foreground' };
      case 'pending':
        return { label: 'Pending', className: 'bg-yellow-100 text-yellow-800' };
      case 'paid':
        return { label: 'Paid', className: 'bg-green-100 text-green-800' };
      case 'unpaid':
        return { label: 'Unpaid', className: 'bg-red-100 text-red-800' };
      case 'overdue':
        return { label: 'Overdue', className: 'bg-red-100 text-red-800' };
      default:
        return { label: status, className: 'bg-muted text-muted-foreground' };
    }
  };

  const config = getStatusConfig();

  return (
    <span className={cn(
      "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
      config.className,
      className
    )}>
      {config.label}
    </span>
  );
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("bg-white border-b border-gray-200", className)}>
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
            {subtitle && (
              <p className="text-gray-600 mt-1">{subtitle}</p>
            )}
          </div>
          {actions && (
            <div className="flex items-center gap-3">
              {actions}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
