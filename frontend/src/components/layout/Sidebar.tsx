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
  Home,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { useUIStore } from "@/store/useUIStore";
import { usePermissions } from "@/hooks/usePermissions";
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
  roles?: UserRole[];
  badge?: number;
  section?: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, section: "MAIN MENU" },
  { href: "/properties", label: "Properties", icon: Building2, roles: ["owner", "manager", "superadmin"] },
  { href: "/tenants", label: "Tenants", icon: Users, roles: ["owner", "manager", "superadmin"] },
  { href: "/leases", label: "Leases", icon: FileText, roles: ["owner", "manager", "superadmin"] },
  { href: "/payments", label: "Payments", icon: CreditCard, roles: ["owner", "manager", "superadmin"], section: "FINANCE" },
  { href: "/analytics", label: "Analytics", icon: BarChart3, roles: ["owner", "manager", "superadmin"] },
  { href: "/inspections", label: "Inspections", icon: ClipboardList, roles: ["owner", "manager", "superadmin", "maintenance"], section: "OPERATIONS" },
  { href: "/maintenance", label: "Maintenance", icon: Wrench, roles: ["owner", "manager", "superadmin", "maintenance"] },
  { href: "/notifications", label: "Notifications", icon: Bell, roles: ["owner", "manager", "superadmin"] },
  { href: "/admin", label: "Admin", icon: Shield, roles: ["superadmin"], section: "SYSTEM" },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const { roles } = usePermissions();

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.roles || item.roles.some((r) => roles.includes(r)),
  );

  let lastSection = "";

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "hidden md:flex flex-col transition-all duration-300 ease-in-out flex-shrink-0",
          sidebarCollapsed ? "w-[72px]" : "w-[240px]",
        )}
        style={{ backgroundColor: "#171725", minHeight: "100vh" }}
        aria-label="Main navigation"
      >
        {/* Logo */}
        <div
          className={cn(
            "flex h-16 items-center border-b border-white/[0.06]",
            sidebarCollapsed ? "justify-center px-4" : "px-5 gap-3",
          )}
        >
          {/* Logo mark */}
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-white font-bold text-sm"
               style={{ background: "#0062FF" }}>
            <Home className="h-4.5 w-4.5" />
          </div>
          {!sidebarCollapsed && (
            <span
              className="font-bold text-lg text-white tracking-tight"
              style={{ fontFamily: "var(--font-poppins, 'Poppins', sans-serif)" }}
            >
              CRIB
            </span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3" aria-label="Sidebar navigation">
          {visibleItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;

            // Section header
            const showSection = !sidebarCollapsed && item.section && item.section !== lastSection;
            if (item.section) lastSection = item.section;

            const linkContent = (
              <Link
                href={item.href}
                className={cn(
                  "flex items-center gap-3 mx-3 px-3 py-2.5 rounded-[8px] text-sm font-medium transition-all duration-150",
                  isActive
                    ? "text-white"
                    : "text-white/55 hover:bg-white/[0.06] hover:text-white/85",
                  sidebarCollapsed && "justify-center mx-3 px-0",
                )}
                style={isActive ? {
                  background: "#0062FF",
                  boxShadow: "0 4px 12px rgba(0,98,255,0.35)",
                } : {}}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className="h-[18px] w-[18px] shrink-0 opacity-90" />
                {!sidebarCollapsed && (
                  <span className="truncate">{item.label}</span>
                )}
                {!sidebarCollapsed && item.badge ? (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white px-1">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            );

            return (
              <div key={item.href}>
                {showSection && (
                  <p className="mt-4 mb-1 px-6 text-[10px] font-semibold tracking-widest uppercase text-white/30">
                    {item.section}
                  </p>
                )}
                {sidebarCollapsed ? (
                  <Tooltip>
                    <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                    <TooltipContent side="right" className="text-xs">
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  linkContent
                )}
              </div>
            );
          })}
        </nav>

        {/* Collapse toggle */}
        <div className="border-t border-white/[0.06] p-3">
          <button
            onClick={toggleSidebar}
            className={cn(
              "flex items-center justify-center w-full rounded-[8px] h-9 transition-colors text-white/40 hover:text-white/70 hover:bg-white/[0.06]",
            )}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
