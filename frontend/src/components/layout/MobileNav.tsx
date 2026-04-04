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
        className="fixed inset-y-0 left-0 z-50 w-72 bg-card border-r shadow-xl animate-slide-in-right md:hidden"
        role="dialog"
        aria-label="Navigation menu"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b px-4 h-16">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white font-bold text-sm">
              C
            </div>
            <span className="font-semibold text-lg">Crib</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        <nav className="p-3 space-y-0.5" aria-label="Mobile navigation">
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
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className="h-4.5 w-4.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </>
  );
}
