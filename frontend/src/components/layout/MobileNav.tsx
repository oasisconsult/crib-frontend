"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  X, LayoutDashboard, Building2, Users, FileText, CreditCard,
  ClipboardList, Bell, BarChart3, Settings, Wrench, Shield,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { useUIStore } from "@/store/useUIStore";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import type { UserRole } from "@/types";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: UserRole[];
  section?: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/",              label: "Dashboard",     icon: LayoutDashboard, section: "MENU" },
  { href: "/properties",   label: "Properties",    icon: Building2,       roles: ["owner","manager","superadmin"] },
  { href: "/tenants",      label: "Tenants",       icon: Users,           roles: ["owner","manager","superadmin"] },
  { href: "/leases",       label: "Leases",        icon: FileText,        roles: ["owner","manager","superadmin"] },
  { href: "/payments",     label: "Payments",      icon: CreditCard,      roles: ["owner","manager","superadmin"], section: "FINANCE" },
  { href: "/inspections",  label: "Inspections",   icon: ClipboardList,   roles: ["owner","manager","superadmin","maintenance"], section: "OPERATIONS" },
  { href: "/maintenance",  label: "Maintenance",   icon: Wrench,          roles: ["owner","manager","superadmin","maintenance"] },
  { href: "/notifications",label: "Notifications", icon: Bell,            roles: ["owner","manager","superadmin"] },
  { href: "/analytics",    label: "Analytics",     icon: BarChart3,       roles: ["owner","manager","superadmin"] },
  { href: "/admin",        label: "Admin",         icon: Shield,          roles: ["superadmin"], section: "SYSTEM" },
  { href: "/settings",     label: "Settings",      icon: Settings },
];

export function MobileNav() {
  const pathname = usePathname();
  const { mobileNavOpen, setMobileNavOpen } = useUIStore();
  const { roles } = usePermissions();

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.roles || item.roles.some((r) => roles.includes(r)),
  );

  if (!mobileNavOpen) return null;

  let lastSection = "";

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm md:hidden"
        onClick={() => setMobileNavOpen(false)}
        aria-hidden="true"
      />
      {/* Drawer */}
      <div
        className="fixed inset-y-0 left-0 z-50 w-[240px] shadow-2xl animate-slide-in-right md:hidden flex flex-col bg-[hsl(var(--sidebar))] border-r border-[hsl(var(--sidebar-border))]"
        role="dialog"
        aria-label="Navigation menu"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-4 h-[60px] border-b border-[hsl(var(--sidebar-border))]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#0062FF] text-white">
              <Building2 className="h-4 w-4" />
            </div>
            <span
              className="font-bold text-[15px] text-[#0F172A] dark:text-white tracking-[-0.01em]"
              style={{ fontFamily: "var(--font-poppins, 'Poppins', sans-serif)" }}
            >
              CRIB
            </span>
          </div>
          <button
            onClick={() => setMobileNavOpen(false)}
            className="text-[hsl(var(--sidebar-section-fg))] hover:text-[hsl(var(--sidebar-foreground))] transition-colors"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-2 px-2" aria-label="Mobile navigation">
          {visibleItems.map((item) => {
            const isActive =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;

            const showSection = item.section && item.section !== lastSection;
            if (item.section) lastSection = item.section;

            return (
              <div key={item.href}>
                {showSection && (
                  <p className="mt-5 mb-1 px-2.5 text-[10px] font-bold tracking-[0.1em] uppercase text-[hsl(var(--sidebar-section-fg))]">
                    {item.section}
                  </p>
                )}
                <Link
                  href={item.href as any}
                  onClick={() => setMobileNavOpen(false)}
                  className={cn(
                    "flex items-center gap-2.5 px-2.5 py-2 rounded-[7px] text-[13.5px] font-medium transition-all",
                    isActive
                      ? "bg-[hsl(var(--sidebar-active-bg))] text-[hsl(var(--sidebar-active-fg))] font-semibold"
                      : "text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-hover-bg))] hover:text-[#0F172A] dark:hover:text-white",
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon
                    className={cn(
                      "h-[18px] w-[18px] shrink-0",
                      isActive ? "text-[hsl(var(--sidebar-active-fg))]" : "text-[hsl(var(--sidebar-foreground))]",
                    )}
                  />
                  {item.label}
                </Link>
              </div>
            );
          })}
        </nav>
      </div>
    </>
  );
}
