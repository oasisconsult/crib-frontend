"use client";

import React from "react";
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
  ChevronDown,
  Wrench,
  HardHat,
  Shield,
  LogOut,
  KeyRound,
  BadgeCheck,
  CreditCard as BillingIcon,
  Globe,
  Plug,
  ToggleLeft,
  UserCircle,
  CalendarClock,
  Mail,
  FileBarChart2,
  ScrollText,
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

interface SubNavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: UserRole[];
}

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
  /**
   * When present, renders this item as an accordion parent.
   * Children are indented below the parent when expanded.
   * Non-superadmin users see the plain href link instead.
   */
  children?: SubNavItem[];
}

/* ── Admin settings sub-items (superadmin only) ─────────────────────────── */

const ADMIN_SETTINGS_CHILDREN: SubNavItem[] = [
  { href: "/settings",             label: "My Preferences",  icon: UserCircle },
  { href: "/admin/demo-bookings",  label: "Demo Bookings",   icon: CalendarClock, roles: ["superadmin"] },
  { href: "/admin/email-templates",label: "Email Templates", icon: Mail,        roles: ["superadmin"] },
  { href: "/admin/billing",        label: "Billing & Plans",  icon: BillingIcon, roles: ["superadmin"] },
  { href: "/admin/platform",       label: "Platform & Agency",icon: Globe,       roles: ["superadmin"] },
  { href: "/admin/integrations",   label: "Integrations",     icon: Plug,        roles: ["superadmin"] },
  { href: "/admin/features",       label: "Feature Flags",    icon: ToggleLeft,  roles: ["superadmin"] },
  { href: "/admin/user-roles",     label: "User Roles",       icon: Shield,      roles: ["superadmin"] },
];

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, section: "MENU" },
  {
    href: "/properties",
    label: "Properties",
    icon: Building2,
    roles: ["owner", "manager", "superadmin", "landlord", "caretaker"],
    permission: { action: "read", resource: "property" },
  },
  {
    href: "/tenants",
    label: "Tenants",
    icon: Users,
    roles: ["owner", "manager", "superadmin", "caretaker"],
    permission: { action: "read", resource: "tenant" },
  },
  {
    href: "/landlords",
    label: "Landlords",
    icon: KeyRound,
    roles: ["manager", "superadmin"],
    // Caretakers do NOT see landlords — only manager-level users manage landlords
  },
  {
    href: "/leases",
    label: "Leases",
    icon: FileText,
    roles: ["owner", "manager", "superadmin", "landlord", "caretaker"],
    permission: { action: "read", resource: "lease" },
  },
  {
    href: "/payments",
    label: "Payments",
    icon: CreditCard,
    roles: ["owner", "manager", "superadmin", "landlord", "caretaker"],
    permission: { action: "read", resource: "payment" },
    // "operations_only" caretakers are blocked at canDo() level — nav item still shows,
    // but the page shows an empty/restricted state instead of amounts.
    section: "FINANCE",
  },
  {
    href: "/analytics",
    label: "Analytics",
    icon: BarChart3,
    roles: ["owner", "manager", "superadmin", "landlord", "caretaker"],
    permission: { action: "read", resource: "analytics" },
  },
  {
    href: "/reports",
    label: "Reports",
    icon: FileBarChart2,
    roles: ["owner", "manager", "superadmin", "landlord", "caretaker"],
    permission: { action: "read", resource: "analytics" },
  },
  {
    href: "/compliance",
    label: "EFRIS Compliance",
    icon: BadgeCheck,
    roles: ["owner", "manager", "superadmin"],
  },
  {
    href: "/audit-log",
    label: "Audit Log",
    icon: ScrollText,
    roles: ["owner", "manager", "superadmin"],
  },
  {
    href: "/inspections",
    label: "Inspections",
    icon: ClipboardList,
    roles: ["owner", "manager", "superadmin", "maintenance", "landlord", "caretaker"],
    permission: { action: "read", resource: "inspection" },
    section: "OPERATIONS",
  },
  {
    href: "/maintenance",
    label: "Maintenance",
    icon: Wrench,
    roles: ["owner", "manager", "superadmin", "maintenance", "landlord", "caretaker"],
    permission: { action: "read", resource: "maintenance_request" },
  },
  {
    href: "/contractors",
    label: "Contractors",
    icon: HardHat,
    roles: ["owner", "manager", "superadmin"],
    permission: { action: "write", resource: "maintenance_request" },
  },
  {
    href: "/notifications",
    label: "Notifications",
    icon: Bell,
    roles: ["owner", "manager", "superadmin", "caretaker"],
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
    // Caretakers cannot manage subscription/billing
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

  // ── Accordion state ───────────────────────────────────────────────────────
  // Track which parent items are expanded. Auto-expand when a child is active.
  const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(() => {
    // Initialise: expand any group whose child matches the current path
    const init = new Set<string>();
    NAV_ITEMS.forEach((item) => {
      if (item.children?.some((c) => pathname.startsWith(c.href))) {
        init.add(item.href);
      }
    });
    // Also expand Settings group if we're on any admin settings route
    if (
      pathname.startsWith("/settings") ||
      pathname.startsWith("/admin/demo-bookings") ||
      pathname.startsWith("/admin/email-templates") ||
      pathname.startsWith("/admin/billing") ||
      pathname.startsWith("/admin/platform") ||
      pathname.startsWith("/admin/integrations") ||
      pathname.startsWith("/admin/features")
    ) {
      init.add("/settings");
    }
    return init;
  });

  function toggleGroup(href: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(href)) next.delete(href);
      else next.add(href);
      return next;
    });
  }

  // ── Build visible items with accordion children injected for superadmins ──
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
  }).map((item) => {
    // Inject admin settings children for the Settings item (superadmin only)
    if (item.href === "/settings" && isSuperAdmin) {
      return {
        ...item,
        children: ADMIN_SETTINGS_CHILDREN,
      };
    }
    return item;
  });

  let lastSection = "";

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "hidden md:flex flex-col flex-shrink-0 h-screen",
          "transition-[width] duration-200 ease-out",
          "bg-[hsl(var(--sidebar))] border-r border-[hsl(var(--sidebar-border))]",
          sidebarCollapsed ? "w-[64px]" : "w-[240px]",
        )}
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
            <Link href="/dashboard" aria-label="Go to dashboard" className="shrink-0 block">
              <Image
                src="/crib-icon-green.png"
                alt="Crib"
                width={160}
                height={40}
                priority
                className="h-[21px] w-auto max-w-[42px]"
              />
            </Link>
          ) : (
            <Link href="/dashboard" aria-label="Go to dashboard">
              <Image
                src="/crib-icon-green.png"
                alt="Crib"
                width={160}
                height={40}
                priority
                className="h-[34px] w-auto"
              />
            </Link>
          )}
        </div>

        {/* ── Nav ───────────────────────────────────────────────────── */}
        <nav
          className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-2"
          aria-label="Sidebar navigation"
        >
          {visibleItems.map((item) => {
            const hasChildren = !sidebarCollapsed && !!item.children?.length;
            const isExpanded  = expandedGroups.has(item.href);
            const childActive = item.children?.some((c) => pathname.startsWith(c.href));
            const isActive    = !hasChildren && (
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
            );
            // Parent is highlighted when a child is active
            const parentHighlighted = hasChildren && childActive;
            const Icon = item.icon;

            const showSection =
              !sidebarCollapsed && item.section && item.section !== lastSection;
            if (item.section) lastSection = item.section;

            // ── Accordion parent button (no navigation — just toggle) ──
            const accordionParent = hasChildren ? (
              <button
                type="button"
                onClick={() => toggleGroup(item.href)}
                aria-expanded={isExpanded}
                className={cn(
                  "w-full flex items-center gap-2.5",
                  "min-h-[40px] px-2.5 py-2 rounded-[7px]",
                  "text-sm font-medium transition-[background,color] duration-150 cursor-pointer",
                  parentHighlighted
                    ? "bg-[hsl(var(--sidebar-active-bg))] text-[hsl(var(--sidebar-active-fg))] font-semibold"
                    : "text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-hover-bg))] hover:text-[hsl(var(--foreground))]",
                )}
              >
                <Icon className={cn(
                  "h-[18px] w-[18px] shrink-0",
                  parentHighlighted ? "text-[hsl(var(--sidebar-active-fg))]" : "text-[hsl(var(--sidebar-foreground))]",
                )} />
                <span className="truncate flex-1 text-left">{item.label}</span>
                <ChevronDown className={cn(
                  "h-3.5 w-3.5 shrink-0 transition-transform duration-200",
                  isExpanded ? "rotate-180" : "rotate-0",
                  parentHighlighted ? "text-[hsl(var(--sidebar-active-fg))]" : "text-[hsl(var(--sidebar-section-fg))]",
                )} />
              </button>
            ) : null;

            // ── Regular link ──
            const link = !hasChildren ? (
              <Link
                href={item.href as any}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5",
                  "min-h-[40px] px-2.5 py-2 rounded-[7px]",
                  "text-sm font-medium",
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
                  <span className="ml-auto h-4.5 min-w-[18px] px-1 flex items-center justify-center rounded-full bg-[hsl(var(--destructive))] text-[10px] font-bold text-white">
                    {item.badge}
                  </span>
                )}
              </Link>
            ) : null;

            // ── Accordion children ──
            const childrenEl = hasChildren && isExpanded ? (
              <div className="mt-0.5 ml-3 pl-3 border-l border-[hsl(var(--sidebar-border))] space-y-0.5">
                {item.children!.map((child) => {
                  const childIsActive = pathname.startsWith(child.href);
                  const ChildIcon = child.icon;
                  return (
                    <Link
                      key={child.href}
                      href={child.href as any}
                      aria-current={childIsActive ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2 min-h-[36px] px-2 py-1.5 rounded-[6px]",
                        "text-xs font-medium transition-[background,color] duration-150 cursor-pointer",
                        childIsActive
                          ? "bg-[hsl(var(--sidebar-active-bg))] text-[hsl(var(--sidebar-active-fg))] font-semibold"
                          : "text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-hover-bg))] hover:text-[hsl(var(--foreground))]",
                      )}
                    >
                      <ChildIcon className={cn(
                        "h-[15px] w-[15px] shrink-0",
                        childIsActive ? "text-[hsl(var(--sidebar-active-fg))]" : "text-[hsl(var(--sidebar-foreground))]",
                      )} />
                      <span className="truncate">{child.label}</span>
                    </Link>
                  );
                })}
              </div>
            ) : null;

            return (
              <div key={item.href}>
                {showSection && (
                  <p className="mt-5 mb-1 px-2.5 text-[10px] font-bold tracking-[0.1em] uppercase text-[hsl(var(--sidebar-section-fg))]">
                    {item.section}
                  </p>
                )}
                {/* Accordion parent — no tooltip needed (always expanded sidebar) */}
                {hasChildren && accordionParent}
                {hasChildren && childrenEl}

                {/* Regular link — wrap in tooltip when collapsed */}
                {!hasChildren && (
                  sidebarCollapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right" className="text-xs font-medium">
                        {item.label}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    link
                  )
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
