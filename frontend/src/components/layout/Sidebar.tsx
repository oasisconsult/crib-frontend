"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  Users,
  FileText,
  CreditCard,
  ClipboardList,
  Bell,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  Wrench,
  Shield,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { useUIStore } from "@/store/useUIStore";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type { UserRole } from "@/types";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** If set, at least one of the user's roles must be in this list. */
  roles?: UserRole[];
  badge?: number;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/properties", label: "Properties", icon: Building2, roles: ["owner", "manager", "superadmin"] },
  { href: "/tenants", label: "Tenants", icon: Users, roles: ["owner", "manager", "superadmin"] },
  { href: "/leases", label: "Leases", icon: FileText, roles: ["owner", "manager", "superadmin"] },
  { href: "/payments", label: "Payments", icon: CreditCard, roles: ["owner", "manager", "superadmin"] },
  { href: "/inspections", label: "Inspections", icon: ClipboardList, roles: ["owner", "manager", "superadmin", "maintenance"] },
  { href: "/maintenance", label: "Maintenance", icon: Wrench, roles: ["owner", "manager", "superadmin", "maintenance"] },
  { href: "/notifications", label: "Notifications", icon: Bell, roles: ["owner", "manager", "superadmin"] },
  { href: "/analytics", label: "Analytics", icon: BarChart3, roles: ["owner", "manager", "superadmin"] },
  { href: "/admin", label: "Admin", icon: Shield, roles: ["superadmin"] },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const { roles } = usePermissions();

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.roles || item.roles.some((r) => roles.includes(r)),
  );

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "hidden md:flex flex-col border-r bg-card transition-all duration-300 ease-in-out",
          sidebarCollapsed ? "w-16" : "w-60",
        )}
        aria-label="Main navigation"
      >
        {/* Logo */}
        <div
          className={cn(
            "flex h-16 items-center border-b px-4",
            sidebarCollapsed ? "justify-center" : "gap-3",
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white font-bold text-sm">
            C
          </div>
          {!sidebarCollapsed && (
            <span className="font-semibold text-lg tracking-tight">Crib</span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5" aria-label="Sidebar navigation">
          {visibleItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;

            const linkContent = (
              <Link
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  sidebarCollapsed && "justify-center px-0",
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className="h-4.5 w-4.5 shrink-0" />
                {!sidebarCollapsed && (
                  <span className="truncate">{item.label}</span>
                )}
                {!sidebarCollapsed && item.badge ? (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive text-xs font-bold text-destructive-foreground px-1">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            );

            if (sidebarCollapsed) {
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              );
            }

            return <div key={item.href}>{linkContent}</div>;
          })}
        </nav>

        {/* Collapse toggle */}
        <div className="border-t p-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleSidebar}
            className="w-full flex justify-center"
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>
      </aside>
    </TooltipProvider>
  );
}

