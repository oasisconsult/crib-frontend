"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Building2, Users, FileText, CreditCard,
  ClipboardList, Bell, BarChart3, Settings, ChevronLeft,
  ChevronRight, Wrench, Shield, LogOut,
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
  roles?: UserRole[];
  badge?: number;
  section?: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/",              label: "Dashboard",     icon: LayoutDashboard, section: "MENU" },
  { href: "/properties",   label: "Properties",    icon: Building2,       roles: ["owner","manager","superadmin"] },
  { href: "/tenants",      label: "Tenants",       icon: Users,           roles: ["owner","manager","superadmin"] },
  { href: "/leases",       label: "Leases",        icon: FileText,        roles: ["owner","manager","superadmin"] },
  { href: "/payments",     label: "Payments",      icon: CreditCard,      roles: ["owner","manager","superadmin"],  section: "FINANCE" },
  { href: "/analytics",    label: "Analytics",     icon: BarChart3,       roles: ["owner","manager","superadmin"] },
  { href: "/inspections",  label: "Inspections",   icon: ClipboardList,   roles: ["owner","manager","superadmin","maintenance"], section: "OPERATIONS" },
  { href: "/maintenance",  label: "Maintenance",   icon: Wrench,          roles: ["owner","manager","superadmin","maintenance"] },
  { href: "/notifications",label: "Notifications", icon: Bell,            roles: ["owner","manager","superadmin"] },
  { href: "/admin",        label: "Admin",         icon: Shield,          roles: ["superadmin"], section: "SYSTEM" },
  { href: "/settings",     label: "Settings",      icon: Settings },
];

/* ── Component ──────────────────────────────────────────────────────────── */

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const { roles } = usePermissions();
  const user = useAppStore((s) => s.user);
  const { logout } = useAuth();

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.roles || item.roles.some((r) => roles.includes(r)),
  );

  let lastSection = "";

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "hidden md:flex flex-col flex-shrink-0",
          "transition-[width] duration-200 ease-out",
          sidebarCollapsed ? "w-[64px]" : "w-[240px]",
        )}
        style={{ background: "#0F172A", minHeight: "100vh" }}
        aria-label="Main navigation"
      >
        {/* ── Logo ──────────────────────────────────────────────────── */}
        <div
          className={cn(
            "flex h-[60px] items-center shrink-0",
            "border-b border-white/[0.07]",
            sidebarCollapsed ? "justify-center px-4" : "px-4 gap-2.5",
          )}
        >
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-white"
            style={{ background: "#0062FF" }}
          >
            <Building2 className="h-4 w-4" />
          </div>
          {!sidebarCollapsed && (
            <span
              className="text-[15px] font-bold text-white tracking-[-0.01em]"
              style={{ fontFamily: "var(--font-poppins,'Poppins',sans-serif)" }}
            >
              CRIB
            </span>
          )}
        </div>

        {/* ── Nav ───────────────────────────────────────────────────── */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2" aria-label="Sidebar navigation">
          {visibleItems.map((item) => {
            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;

            const showSection = !sidebarCollapsed && item.section && item.section !== lastSection;
            if (item.section) lastSection = item.section;

            const link = (
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5",
                  "mx-2 px-2.5 py-2 rounded-[7px]",
                  "text-[13.5px] font-medium",
                  "transition-[background,color] duration-100",
                  isActive
                    ? "bg-[#0062FF] text-white font-semibold"
                    : "text-white/50 hover:bg-white/[0.07] hover:text-white/90",
                  sidebarCollapsed && "justify-center px-0 mx-2",
                )}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
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
                  <p className="mt-5 mb-1 px-4 text-[10px] font-bold tracking-[0.1em] uppercase text-white/25">
                    {item.section}
                  </p>
                )}
                {sidebarCollapsed ? (
                  <Tooltip>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right" className="text-xs font-medium">
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                ) : link}
              </div>
            );
          })}
        </nav>

        {/* ── User profile strip ────────────────────────────────────── */}
        <div className="shrink-0 border-t border-white/[0.07]">
          {/* Collapse toggle */}
          <button
            onClick={toggleSidebar}
            className={cn(
              "w-full flex items-center justify-center h-9 mt-1 mx-0",
              "text-white/30 hover:text-white/60 transition-colors",
            )}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed
              ? <ChevronRight className="h-3.5 w-3.5" />
              : <ChevronLeft className="h-3.5 w-3.5" />}
          </button>

          {/* User info */}
          {!sidebarCollapsed && (
            <div className="px-3 pb-3">
              <div className="flex items-center gap-2.5 rounded-[8px] px-2 py-2 hover:bg-white/[0.05] group cursor-pointer transition-colors">
                {/* Avatar */}
                <div
                  className="h-7 w-7 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold text-white"
                  style={{ background: "#0062FF" }}
                >
                  {getInitials(user?.name ?? "U")}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] font-semibold text-white/90 truncate leading-tight">
                    {user?.name ?? "User"}
                  </p>
                  <p className="text-[11px] text-white/35 truncate leading-tight">
                    {user?.email ?? ""}
                  </p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); logout(); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-white/40 hover:text-white/80 p-0.5"
                  aria-label="Sign out"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}
