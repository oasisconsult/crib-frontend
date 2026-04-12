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

export function MobileNav() {
  const pathname = usePathname();
  const { mobileNavOpen, setMobileNavOpen } = useUIStore();
  const { roles } = usePermissions();

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.roles || item.roles.some((r) => roles.includes(r)),
  );

  if (!mobileNavOpen) return null;

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
        className="fixed inset-y-0 left-0 z-50 w-[240px] shadow-2xl animate-slide-in-right md:hidden flex flex-col"
        style={{ background: "#171725" }}
        role="dialog"
        aria-label="Navigation menu"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-5 h-16" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-[10px] text-white" style={{ background: "#0062FF" }}>
              <Building2 className="h-4 w-4" />
            </div>
            <span className="font-bold text-lg text-white" style={{ fontFamily: "var(--font-poppins, 'Poppins', sans-serif)" }}>
              CRIB
            </span>
          </div>
          <button
            onClick={() => setMobileNavOpen(false)}
            className="text-white/40 hover:text-white/70 transition-colors"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-3" aria-label="Mobile navigation">
          {visibleItems.map((item) => {
            const isActive =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileNavOpen(false)}
                className={cn(
                  "flex items-center gap-3 mx-3 px-3 py-2.5 rounded-[8px] text-sm font-medium transition-all",
                  isActive
                    ? "text-white"
                    : "text-white/55 hover:bg-white/[0.06] hover:text-white/85",
                )}
                style={isActive ? { background: "#0062FF", boxShadow: "0 4px 12px rgba(0,98,255,0.35)" } : {}}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </>
  );
}
