"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/utils/cn";
import {
  Home,
  Building,
  Users,
  CreditCard,
  FileText,
  Settings,
  Menu,
  X,
  Bell,
  Search,
  User,
} from "lucide-react";

const navigationItems = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: Home,
  },
  {
    name: "Properties",
    href: "/properties",
    icon: Building,
  },
  {
    name: "Tenants",
    href: "/tenants",
    icon: Users,
  },
  {
    name: "Payments",
    href: "/payments",
    icon: CreditCard,
  },
  {
    name: "Reports",
    href: "/reports",
    icon: FileText,
  },
  {
    name: "Settings",
    href: "/settings",
    icon: Settings,
  },
];

interface SidebarProps {
  className?: string;
  isMobile?: boolean;
  onClose?: () => void;
}

export function Sidebar({
  className,
  isMobile = false,
  onClose,
}: SidebarProps) {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        "flex flex-col h-full bg-white border-r border-gray-200",
        isMobile ? "fixed inset-y-0 left-0 z-50 w-64" : "w-64",
        className,
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-between h-16 px-6 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#0B3D91] rounded-[6px] flex items-center justify-center">
            <span className="text-white font-bold text-lg">C</span>
          </div>
          <span className="text-xl font-semibold text-slate-900">Crib</span>
        </div>
        {isMobile && (
          <button
            onClick={onClose}
            className="p-2 rounded-[6px] hover:bg-sky-50 transition-colors"
            aria-label="Close navigation"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation Items */}
      <div className="flex-1 px-4 py-6 space-y-1">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");

          return (
            <Link
              key={item.name}
              href={item.href as any}
              onClick={isMobile ? onClose : undefined}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-[6px] text-sm font-medium transition-colors",
                isActive
                  ? "bg-sky-50 text-sky-700"
                  : "text-slate-700 hover:bg-sky-50",
              )}
            >
              <Icon className="w-5 h-5" />
              {item.name}
            </Link>
          );
        })}
      </div>

      {/* User Section */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-sky-100 rounded-full flex items-center justify-center">
            <User className="w-4 h-4 text-sky-700" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">
              John Doe
            </p>
            <p className="text-xs text-slate-500 truncate">john@example.com</p>
          </div>
        </div>
      </div>
    </nav>
  );
}

interface MobileNavigationProps {
  className?: string;
}

export function MobileNavigation({ className }: MobileNavigationProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      {/* Mobile Navigation Bar */}
      <div
        className={cn(
          "md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40",
          className,
        )}
      >
        <div className="flex items-center justify-around h-16">
          {navigationItems.slice(0, 4).map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");

            return (
              <Link
                key={item.name}
                href={item.href as any}
                className={cn(
                  "flex flex-col items-center gap-1 px-3 py-2 text-xs font-medium transition-colors",
                  isActive ? "text-blue-600" : "text-gray-600",
                )}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs">{item.name}</span>
              </Link>
            );
          })}

          {/* More button for remaining items */}
          <button
            onClick={() => setIsOpen(true)}
            className="flex flex-col items-center gap-1 px-3 py-2 text-xs font-medium text-gray-600 transition-colors"
          >
            <Menu className="w-5 h-5" />
            <span className="text-xs">More</span>
          </button>
        </div>
      </div>

      {/* Mobile Slide-out Navigation */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Sidebar */}
          <Sidebar isMobile={true} onClose={() => setIsOpen(false)} />
        </>
      )}
    </>
  );
}

interface HeaderProps {
  className?: string;
  onMobileMenuOpen?: () => void;
}

export function Header({ className, onMobileMenuOpen }: HeaderProps) {
  return (
    <header
      className={cn(
        "h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6",
        className,
      )}
    >
      {/* Mobile Menu Button */}
      <button
        onClick={onMobileMenuOpen}
        className="md:hidden p-2 rounded-[6px] hover:bg-gray-100 transition-colors"
        aria-label="Open navigation"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Search Bar */}
      <div className="hidden md:flex flex-1 max-w-md mx-4">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-[6px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-4">
        {/* Notifications */}
        <button
          className="p-2 rounded-[6px] hover:bg-gray-100 transition-colors relative"
          aria-label="Notifications"
        >
          <Bell className="w-5 h-5" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>

        {/* User Menu */}
        <div className="hidden md:flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-medium text-gray-900">John Doe</p>
            <p className="text-xs text-gray-500">Landlord</p>
          </div>
          <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
            <User className="w-4 h-4 text-gray-600" />
          </div>
        </div>
      </div>
    </header>
  );
}

interface LayoutProps {
  children: React.ReactNode;
  className?: string;
}

export function Layout({ children, className }: LayoutProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Skip to Content Link */}
      <a href="#main-content" className="re-skip-link">
        Skip to main content
      </a>

      {/* Desktop Sidebar */}
      <div className="hidden md:fixed md:inset-y-0 md:left-0 md:z-50 md:block">
        <Sidebar />
      </div>

      {/* Main Content */}
      <div className="md:pl-64">
        {/* Header */}
        <Header onMobileMenuOpen={() => setIsMobileMenuOpen(true)} />

        {/* Page Content */}
        <main id="main-content" className={cn("pb-20 md:pb-0", className)}>
          {children}
        </main>
      </div>

      {/* Mobile Navigation */}
      <MobileNavigation />

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={() => setIsMobileMenuOpen(false)}
          />

          {/* Mobile Sidebar */}
          <div className="md:hidden fixed inset-y-0 left-0 z-50 w-64">
            <Sidebar
              isMobile={true}
              onClose={() => setIsMobileMenuOpen(false)}
            />
          </div>
        </>
      )}
    </div>
  );
}
