"use client";

import { Bell, Search, Menu, LogOut, Settings, ChevronDown, Sun, Moon, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUIStore } from "@/store/useUIStore";
import { useAppStore } from "@/store/useAppStore";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { getInitials } from "@/utils/formatters";
import Link from "next/link";
import { cn } from "@/utils/cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PropertySwitcher } from "./PropertySwitcher";

type ThemeOption = "light" | "dark" | "system";

const THEME_OPTIONS: { value: ThemeOption; icon: React.ComponentType<{ className?: string }>; label: string }[] = [
  { value: "light",  icon: Sun,     label: "Light" },
  { value: "dark",   icon: Moon,    label: "Dark" },
  { value: "system", icon: Monitor, label: "System" },
];

export function Header() {
  const { setMobileNavOpen, setCommandPaletteOpen } = useUIStore();
  const user = useAppStore((s) => s.user);
  const { logout } = useAuth();
  const { preference, setPreference } = useTheme();

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-3 px-4 md:px-6 bg-[hsl(var(--header))] border-b border-[hsl(var(--sidebar-border))] shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
      {/* Mobile menu */}
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden text-[#696974] hover:text-[#171725] hover:bg-[#F1F1F5]"
        onClick={() => setMobileNavOpen(true)}
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Property switcher */}
      <div className="hidden md:block">
        <PropertySwitcher />
      </div>

      {/* Search trigger */}
      <button
        className="hidden md:flex flex-1 max-w-[380px] items-center gap-2 h-10 px-3 rounded-[8px] text-sm border transition-colors text-[hsl(var(--muted-foreground))] cursor-pointer bg-[hsl(var(--muted))] border-[hsl(var(--border))] hover:border-[#0062FF]/30 focus:outline-none"
        onClick={() => setCommandPaletteOpen(true)}
        aria-label="Open search"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">Search properties, tenants...</span>
        <kbd className="text-xs font-mono bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded px-1.5 py-0.5">
          ⌘K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-1.5">
        {/* ── 3-way theme toggle ──────────────────────────────────── */}
        <div
          className="hidden sm:flex items-center gap-0.5 rounded-[8px] bg-[hsl(var(--muted))] border border-[hsl(var(--border))] p-0.5"
          role="group"
          aria-label="Theme preference"
        >
          {THEME_OPTIONS.map(({ value, icon: Icon, label }) => (
            <button
              key={value}
              onClick={() => setPreference(value)}
              aria-label={`${label} mode`}
              aria-pressed={preference === value}
              className={cn(
                "flex items-center justify-center h-7 w-7 rounded-[6px] transition-all duration-150",
                preference === value
                  ? "bg-[hsl(var(--header))] text-[#0062FF] shadow-sm border border-[hsl(var(--border))]"
                  : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--header))]",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>

        {/* Notifications */}
        <Button
          variant="ghost"
          size="icon"
          className="relative text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] h-9 w-9 rounded-[8px]"
          aria-label="Notifications"
          asChild
        >
          <Link href="/notifications">
            <Bell className="h-5 w-5" />
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500 border-2 border-[hsl(var(--header))]" />
          </Link>
        </Button>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-2 h-9 px-2 rounded-[8px] hover:bg-[hsl(var(--muted))] transition-colors"
              aria-label="User menu"
            >
              <Avatar className="h-7 w-7">
                <AvatarImage src={user?.avatar} alt={user?.name} />
                <AvatarFallback className="text-xs font-semibold text-white bg-[#0062FF]">
                  {getInitials(user?.name ?? "U")}
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:flex flex-col items-start">
                <span className="text-sm font-semibold text-[hsl(var(--foreground))] leading-tight">
                  {user?.name ?? "User"}
                </span>
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))] hidden md:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-0.5">
                <span className="font-semibold text-sm">{user?.name ?? "User"}</span>
                <span className="text-xs text-[hsl(var(--muted-foreground))] font-normal">{user?.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {/* Mobile theme toggle inside dropdown */}
            <div className="sm:hidden px-1 py-1.5">
              <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Theme</p>
              <div className="flex items-center gap-1">
                {THEME_OPTIONS.map(({ value, icon: Icon, label }) => (
                  <button
                    key={value}
                    onClick={() => setPreference(value)}
                    className={cn(
                      "flex-1 flex flex-col items-center gap-1 py-1.5 rounded-[6px] text-[10px] font-medium transition-colors",
                      preference === value
                        ? "bg-[#0062FF]/10 text-[#0062FF]"
                        : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <DropdownMenuSeparator className="sm:hidden" />
            <DropdownMenuItem asChild>
              <Link href="/settings" className="gap-2 cursor-pointer">
                <Settings className="h-4 w-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 text-red-500 focus:text-red-500 cursor-pointer"
              onSelect={(e) => {
                e.preventDefault();
                logout();
              }}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
