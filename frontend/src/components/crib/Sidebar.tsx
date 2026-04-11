"use client";

// import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import { useTheme } from "@/contexts/ThemeContext";
import {
  Home,
  Building2,
  Users,
  FileText,
  Settings,
  HelpCircle,
  LogOut,
  Sun,
  Moon,
  Menu,
  X
} from "lucide-react";
import { useState } from "react";
import { Button } from "./Button";

interface NavItem {
  icon: React.ReactNode;
  label: string;
  href: string;
  active?: boolean;
}

interface SidebarProps {
  className?: string;
  collapsed?: boolean;
  onToggle?: () => void;
}

export function Sidebar({ className = "", collapsed = false, onToggle }: SidebarProps) {
  const { theme, toggleTheme } = useTheme();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const navItems: NavItem[] = [
    { icon: <Home className="w-5 h-5" />, label: "Dashboard", href: "/dashboard", active: true },
    { icon: <Building2 className="w-5 h-5" />, label: "Properties", href: "/properties" },
    { icon: <Users className="w-5 h-5" />, label: "Tenants", href: "/tenants" },
    { icon: <FileText className="w-5 h-5" />, label: "Documents", href: "/documents" },
    { icon: <Settings className="w-5 h-5" />, label: "Settings", href: "/settings" },
  ];

  const sidebarClasses = cn(
    "w-64 bg-surface-dark border-r border-border-dark flex flex-col transition-all duration-300",
    collapsed && "w-20",
    className
  );

  return (
    <>
      {/* Mobile backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          sidebarClasses,
          "fixed lg:relative inset-y-0 left-0 z-50 lg:z-auto transform",
          isMobileOpen ? "translate-x-0 lg:translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Header */}
        <div className="p-6 border-b border-border-dark">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              {!collapsed && (
                <span className="text-xl font-bold text-text-dark">CRIB</span>
              )}
            </div>
            <button
              onClick={() => setIsMobileOpen(false)}
              className="lg:hidden text-muted hover:text-text-dark transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item, index) => (
            <a
              key={item.label}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
                item.active
                  ? "bg-primary text-white"
                  : "text-muted hover:bg-white/5 hover:text-text-dark"
              )}
            >
              {item.icon}
              {!collapsed && <span className="font-medium">{item.label}</span>}
            </a>
          ))}
        </nav>

        {/* Bottom actions */}
        <div className="p-4 space-y-2 border-t border-border-dark">
          {/* Theme toggle */}
          <Button
            variant="ghost"
            onClick={toggleTheme}
            className="w-full justify-start"
          >
            {theme === "dark" ? (
              <Sun className="w-5 h-5" />
            ) : (
              <Moon className="w-5 h-5" />
            )}
            {!collapsed && (
              <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
            )}
          </Button>

          {/* Help */}
          <Button variant="ghost" className="w-full justify-start">
            <HelpCircle className="w-5 h-5" />
            {!collapsed && <span>Help</span>}
          </Button>

          {/* Logout */}
          <Button variant="danger" className="w-full justify-start">
            <LogOut className="w-5 h-5" />
            {!collapsed && <span>Logout</span>}
          </Button>
        </div>
      </aside>

      {/* Mobile menu toggle */}
      <button
        onClick={() => setIsMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-40 p-2 bg-surface-dark border border-border-dark rounded-xl"
      >
        <Menu className="w-5 h-5 text-text-dark" />
      </button>
    </>
  );
}
