"use client";

import Link from "next/link";
import Image from "next/image";
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
  LogOut,
  KeyRound,
  BadgeCheck,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { useUIStore } from "@/store/useUIStore";
import { useAppStore } from "@/store/useAppStore";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { getInitials } from "@/utils/formatters";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { UserRole } from "@/types";

/* ── Nav item definition ────────────────────────────────────────────────── */

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Role-based gate (first line of defence, fast) */
  roles?: UserRole[];
  /** DB-driven permission gate — checked against Access Control config */
  permission?: { action: string; resource: string };
  badge?: number;
  section?: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, section: "MENU" },
  {
    href: "/properties",
    label: "Properties",
    icon: Building2,
    roles: ["owner", "manager", "superadmin", "landlord"],
    permission: { action: "read", resource: "property" },
  },
  {
    href: "/tenants",
    label: "Tenants",
    icon: Users,
    roles: ["owner", "manager", "superadmin"],
    permission: { action: "read", resource: "tenant" },
  },
  {
    href: "/landlords",
    label: "Landlords",
    icon: KeyRound,
    roles: ["manager", "superadmin"],
  },
  {
    href: "/leases",
    label: "Leases",
    icon: FileText,
    roles: ["owner", "manager", "superadmin", "landlord"],
    permission: { action: "read", resource: "lease" },
  },
  {
    href: "/payments",
    label: "Payments",
    icon: CreditCard,
    roles: ["owner", "manager", "superadmin", "landlord"],
    permission: { action: "read", resource: "payment" },
    section: "FINANCE",
  },
  {
    href: "/analytics",
    label: "Analytics",
    icon: BarChart3,
    roles: ["owner", "manager", "superadmin", "landlord"],
    permission: { action: "read", resource: "analytics" },
  },
  {
    href: "/inspections",
    label: "Inspections",
    icon: ClipboardList,
    roles: ["owner", "manager", "superadmin", "maintenance", "landlord"],
    permission: { action: "read", resource: "inspection" },
    section: "OPERATIONS",
  },
  {
    href: "/maintenance",
    label: "Maintenance",
    icon: Wrench,
    roles: ["owner", "manager", "superadmin", "maintenance", "landlord"],
    permission: { action: "read", resource: "maintenance_request" },
  },
  {
    href: "/notifications",
    label: "Notifications",
    icon: Bell,
    roles: ["owner", "manager", "superadmin"],
  },
  {
    href: "/admin",
    label: "Admin",
    icon: Shield,
    roles: ["superadmin"],    // Security boundary — always role-gated
    section: "SYSTEM",
  },
  {
    href: "/subscription",
    label: "Subscription",
    icon: BadgeCheck,
    roles: ["owner", "manager", "superadmin", "landlord"],
    section: "ACCOUNT",
  },
  { href: "/settings", label: "Settings", icon: Settings },
];

/* ── Component ──────────────────────────────────────────────────────────── */

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const { roles, canDo, isSuperAdmin } = usePermissions();
  const user = useAppStore((s) => s.user);
  const { logout } = useAuth();

  const visibleItems = NAV_ITEMS.filter((item) => {
    // 1. Role gate (fast, no DB) — superadmin bypasses
    if (item.roles && !isSuperAdmin && !item.roles.some((r) => roles.includes(r))) {
      return false;
    }
    // 2. DB-driven permission gate — Access Control page controls this
    if (item.permission && !canDo(item.permission.action, item.permission.resource)) {
      return false;
    }
    return true;
  });

  let lastSection = "";

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "hidden md:flex flex-col flex-shrink-0",
          "transition-[width] duration-200 ease-out",
          "bg-[hsl(var(--sidebar))] border-r border-[hsl(var(--sidebar-border))]",
          sidebarCollapsed ? "w-[64px]" : "w-[240px]",
        )}
        style={{ minHeight: "100vh" }}
        aria-label="Main navigation"
      >
        {/* ── Logo ──────────────────────────────────────────────────── */}
        <div
          className={cn(
            "flex h-[60px] items-center shrink-0",
            "border-b border-[hsl(var(--sidebar-border))]",
            sidebarCollapsed ? "justify-center px-4" : "px-4 gap-2.5",
          )}
        >
          {sidebarCollapsed ? (
            <div className="relative w-6 h-6 shrink-0">
              <Image
                src="/crib_logo_green.png"
                alt="Crib"
                fill
                priority
                className="object-contain"
              />
            </div>
          ) : (
            <Image
              src="/crib_logo_green.png"
              alt="Crib"
              width={80}
              height={24}
              priority
              className="w-[72px] lg:w-[80px] h-auto"
              style={{ height: 'auto' }}
            />
          )}
        </div>

        {/* ── Nav ───────────────────────────────────────────────────── */}
        <nav
          className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-2"
          aria-label="Sidebar navigation"
        >
          {visibleItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;

            const showSection =
              !sidebarCollapsed && item.section && item.section !== lastSection;
            if (item.section) lastSection = item.section;

            const link = (
              <Link
                href={item.href as any}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5",
                  "min-h-[40px] px-2.5 py-2 rounded-[7px]",
                  "text-[13.5px] font-medium",
                  "transition-[background,color] duration-150",
                  "cursor-pointer",
                  isActive
                    ? "bg-[hsl(var(--sidebar-active-bg))] text-[hsl(var(--sidebar-active-fg))] font-semibold"
                    : "text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-hover-bg))] hover:text-[hsl(var(--foreground))]",
                  sidebarCollapsed && "justify-center px-0 mx-auto w-10",
                )}
              >
                <Icon
                  className={cn(
                    "h-[18px] w-[18px] shrink-0",
                    isActive
                      ? "text-[hsl(var(--sidebar-active-fg))]"
                      : "text-[hsl(var(--sidebar-foreground))]",
                  )}
                />
                {!sidebarCollapsed && (
                  <span className="truncate">{item.label}</span>
                )}
                {!sidebarCollapsed && item.badge && (
                  <span className="ml-auto h-4.5 min-w-[18px] px-1 flex items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                    {item.badge}
                  </span>
                )}
              </Link>
            );

            return (
              <div key={item.href}>
                {showSection && (
                  <p className="mt-5 mb-1 px-2.5 text-[10px] font-bold tracking-[0.1em] uppercase text-[hsl(var(--sidebar-section-fg))]">
                    {item.section}
                  </p>
                )}
                {sidebarCollapsed ? (
                  <Tooltip>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent
                      side="right"
                      className="text-xs font-medium"
                    >
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  link
                )}
              </div>
            );
          })}
        </nav>

        {/* ── User profile strip ────────────────────────────────────── */}
        <div className="shrink-0 border-t border-[hsl(var(--sidebar-border))]">
          {/* Collapse toggle */}
          <button
            onClick={toggleSidebar}
            className={cn(
              "w-full flex items-center justify-center min-h-[40px] mt-1",
              "cursor-pointer text-[hsl(var(--sidebar-section-fg))] hover:text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-hover-bg))] rounded-[6px] transition-colors duration-150",
            )}
            aria-label={
              sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
            }
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronLeft className="h-3.5 w-3.5" />
            )}
          </button>

          {/* User info */}
          {!sidebarCollapsed ? (
            <div className="px-3 pb-3">
              <div className="flex items-center gap-2.5 rounded-[8px] px-2 py-2.5 min-h-[44px] hover:bg-[hsl(var(--sidebar-hover-bg))] group cursor-pointer transition-colors duration-150">
                <div className="h-7 w-7 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold text-[hsl(var(--primary-foreground))] bg-[hsl(var(--primary))]">
                  {getInitials(user?.name ?? "U")}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] font-semibold text-[hsl(var(--foreground))] truncate leading-tight">
                    {user?.name ?? "User"}
                  </p>
                  <p className="text-[11px] text-[hsl(var(--sidebar-section-fg))] truncate leading-tight">
                    {user?.email ?? ""}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    logout();
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-[hsl(var(--sidebar-section-fg))] hover:text-red-500 p-0.5"
                  aria-label="Sign out"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="pb-2 flex justify-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold text-[hsl(var(--primary-foreground))] bg-[hsl(var(--primary))] cursor-pointer">
                    {getInitials(user?.name ?? "U")}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs font-medium">
                  {user?.name ?? "User"}
                </TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}
