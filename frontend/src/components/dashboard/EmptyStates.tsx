"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  CheckCircle2, 
  AlertCircle, 
  Home, 
  Plus, 
  FileText, 
  Users, 
  Building2,
  TrendingUp,
  RefreshCw,
  Search
} from "lucide-react";
import { cn } from "@/utils/cn";

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: React.ComponentType<{ className?: string }>;
  action?: {
    label: string;
    onClick: () => void;
    variant?: "default" | "outline" | "secondary" | "ghost" | "destructive";
  };
  className?: string;
}

export function EmptyState({ title, description, icon: Icon, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-10 gap-4 text-center px-4", className)}>
      {Icon && <Icon className="h-12 w-12 text-muted-foreground" />}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground max-w-md">{description}</p>
      </div>
      {action && (
        <Button 
          onClick={action.onClick} 
          variant={action.variant || "default"}
          className="gap-2"
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}

export function EmptyPayments() {
  return (
    <EmptyState
      title="All payments up to date"
      description="No pending payments at the moment. All tenants have paid their rent on time."
      icon={CheckCircle2}
      action={{
        label: "View Payment History",
        onClick: () => window.location.href = "/payments",
        variant: "outline"
      }}
    />
  );
}

export function EmptyProperties() {
  return (
    <EmptyState
      title="No properties yet"
      description="Get started by adding your first property to begin managing your rental portfolio."
      icon={Building2}
      action={{
        label: "Add Property",
        onClick: () => window.location.href = "/properties/new",
        variant: "default"
      }}
    />
  );
}

export function EmptyTenants() {
  return (
    <EmptyState
      title="No tenants yet"
      description="Invite your first tenant to start managing leases and collecting rent."
      icon={Users}
      action={{
        label: "Invite Tenant",
        onClick: () => window.location.href = "/tenants",
        variant: "default"
      }}
    />
  );
}

export function EmptyMaintenance() {
  return (
    <EmptyState
      title="No maintenance requests"
      description="All systems are running smoothly. No maintenance issues reported."
      icon={CheckCircle2}
    />
  );
}

export function EmptyInspections() {
  return (
    <EmptyState
      title="No scheduled inspections"
      description="No inspections are scheduled. You can schedule inspections from the properties page."
      icon={FileText}
      action={{
        label: "Schedule Inspection",
        onClick: () => window.location.href = "/inspections/new",
        variant: "outline"
      }}
    />
  );
}

export function EmptyRevenue() {
  return (
    <EmptyState
      title="No revenue data yet"
      description="Revenue data will appear once you have active leases and payment history."
      icon={TrendingUp}
      action={{
        label: "Add Property",
        onClick: () => window.location.href = "/properties/new",
        variant: "default"
      }}
    />
  );
}

export function EmptySearch({ type }: { type: "properties" | "tenants" | "payments" | "maintenance" }) {
  const typeConfig = {
    properties: {
      title: "No properties found",
      description: "Try adjusting your search criteria or filters to find what you're looking for.",
      icon: Building2
    },
    tenants: {
      title: "No tenants found",
      description: "No tenants match your search. Try different keywords or filters.",
      icon: Users
    },
    payments: {
      title: "No payments found",
      description: "No payments match your search criteria. Try adjusting filters or date range.",
      icon: FileText
    },
    maintenance: {
      title: "No maintenance requests found",
      description: "No maintenance issues match your search. Try different filters or status.",
      icon: AlertCircle
    }
  };

  const config = typeConfig[type];

  return (
    <EmptyState
      title={config.title}
      description={config.description}
      icon={config.icon}
      action={{
        label: "Clear Search",
        onClick: () => {
          const searchInput = document.querySelector('input[type="search"]') as HTMLInputElement;
          if (searchInput) {
            searchInput.value = '';
            searchInput.dispatchEvent(new Event('input'));
          }
        },
        variant: "outline"
      }}
    />
  );
}

interface ErrorStateProps {
  title?: string;
  description?: string;
  error?: Error | string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({ 
  title = "Something went wrong", 
  description = "We encountered an error while loading this data. Please try again.",
  error,
  onRetry,
  className 
}: ErrorStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-10 gap-4 text-center px-4", className)}>
      <AlertCircle className="h-12 w-12 text-destructive" />
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground max-w-md">{description}</p>
        {error && (
          <details className="text-xs text-muted-foreground max-w-md">
            <summary className="cursor-pointer font-medium">Error details</summary>
            <pre className="mt-2 p-2 bg-muted rounded text-left overflow-auto">
              {typeof error === 'string' ? error : error.message || String(error)}
            </pre>
          </details>
        )}
      </div>
      {onRetry && (
        <Button onClick={onRetry} variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Try Again
        </Button>
      )}
    </div>
  );
}

export function NetworkError({ onRetry }: { onRetry?: () => void }) {
  return (
    <ErrorState
      title="Network Error"
      description="Unable to connect to the server. Please check your internet connection and try again."
      onRetry={onRetry}
    />
  );
}

export function DataLoadError({ error, onRetry }: { error?: Error; onRetry?: () => void }) {
  return (
    <ErrorState
      title="Failed to Load Data"
      description="We couldn't load the data due to an error. Please try again or contact support if the problem persists."
      error={error}
      onRetry={onRetry}
    />
  );
}

// Card-based empty states for specific components
export function CardEmptyState({ 
  title, 
  description, 
  icon: Icon, 
  action 
}: EmptyStateProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-col items-center justify-center gap-4 text-center">
          {Icon && <Icon className="h-8 w-8 text-muted-foreground" />}
          <div className="space-y-2">
            <h4 className="font-medium">{title}</h4>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          {action && (
            <Button 
              onClick={action.onClick} 
              variant={action.variant || "outline"}
              size="sm"
              className="gap-2"
            >
              {action.label}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function CardErrorState({ 
  title = "Error loading data", 
  description = "Please try again later.",
  onRetry 
}: { 
  title?: string; 
  description?: string; 
  onRetry?: () => void; 
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-col items-center justify-center gap-4 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <div className="space-y-2">
            <h4 className="font-medium">{title}</h4>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          {onRetry && (
            <Button onClick={onRetry} variant="outline" size="sm" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
