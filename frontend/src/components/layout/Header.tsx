"use client";

import {
  Bell,
  Search,
  Menu,
  LogOut,
  Settings,
  ChevronDown,
  Sun,
  Moon,
  Monitor,
  MessageCircle,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUIStore } from "@/store/useUIStore";
import { useAppStore } from "@/store/useAppStore";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { getInitials, formatRelative } from "@/utils/formatters";
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
import { useUnreadMessageCount, useAllMessages } from "@/hooks/useMessages";

type ThemeOption = "light" | "dark" | "system";

const THEME_OPTIONS: {
  value: ThemeOption;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}[] = [
  { value: "light", icon: Sun, label: "Light" },
  { value: "dark", icon: Moon, label: "Dark" },
  { value: "system", icon: Monitor, label: "System" },
];

export function Header() {
  const { setMobileNavOpen, setCommandPaletteOpen } = useUIStore();
  const user = useAppStore((s) => s.user);
  const { logout } = useAuth();
  const { preference, setPreference } = useTheme();
  const { data: unreadData } = useUnreadMessageCount();
  const { data: recentMessages } = useAllMessages(1, false);
  const unreadCount = unreadData?.count ?? 0;

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-3 px-4 md:px-6 bg-header border-b border-sidebar-border shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
      {/* Mobile menu */}
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
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
        className="hidden md:flex flex-1 max-w-[380px] items-center gap-2 h-10 px-3 rounded-[8px] text-sm border transition-colors text-muted-foreground cursor-pointer bg-[hsl(var(--input))] border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/40 hover:shadow-[0_0_0_3px_hsl(var(--accent))] focus:outline-none"
        onClick={() => setCommandPaletteOpen(true)}
        aria-label="Open search"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">Search properties, tenants...</span>
        <kbd className="text-xs font-mono bg-background border border-border rounded px-1.5 py-0.5">
          ⌘K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-1.5">
        {/* ── MailHog dev inbox (only when NEXT_PUBLIC_MAILHOG_URL is set) ── */}
        {process.env.NEXT_PUBLIC_MAILHOG_URL && (
          <a
            href={process.env.NEXT_PUBLIC_MAILHOG_URL}
            target="_blank"
            rel="noopener noreferrer"
            title="Open MailHog dev inbox"
            className="hidden sm:flex items-center gap-1.5 h-8 px-2.5 rounded-[6px] text-xs font-medium text-amber-700 bg-amber-100 border border-amber-300 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700 dark:hover:bg-amber-900/60 transition-colors"
          >
            <Mail className="h-3.5 w-3.5" />
            MailHog
          </a>
        )}

        {/* ── 3-way theme toggle ──────────────────────────────────── */}
        <div
          className="hidden sm:flex items-center gap-0.5 rounded-[10px] bg-header border border-border p-0.5"
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
                "flex items-center justify-center h-10 w-10 rounded-[8px] transition-all duration-150 cursor-pointer",
                preference === value
                  ? "bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] shadow-sm border border-[hsl(var(--primary))]/20"
                  : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]",
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] h-10 w-10 rounded-[8px]"
              aria-label="Message notifications"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 border-2 border-header text-[9px] font-bold text-white leading-none">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Messages</span>
              {unreadCount > 0 && (
                <span className="text-xs font-normal text-muted-foreground">
                  {unreadCount} unread
                </span>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {recentMessages?.data?.length ? (
              recentMessages.data.slice(0, 5).map((msg) => (
                <DropdownMenuItem key={msg.id} asChild>
                  <Link
                    href={msg.leaseId ? `/leases/${msg.leaseId}` : "/messages"}
                    className="flex flex-col items-start gap-0.5 py-2.5 cursor-pointer"
                  >
                    <div className="flex items-center gap-1.5 w-full">
                      <MessageCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="font-medium text-sm truncate flex-1">{msg.senderName}</span>
                      {!msg.readAt && (
                        <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1 pl-5">{msg.content}</p>
                    <span className="text-[10px] text-muted-foreground pl-5">{formatRelative(msg.createdAt)}</span>
                  </Link>
                </DropdownMenuItem>
              ))
            ) : (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                No messages yet
              </div>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/notifications" className="justify-center text-xs text-primary cursor-pointer">
                View all notifications
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-2 h-10 px-2.5 rounded-[8px] hover:bg-[hsl(var(--accent))] transition-colors duration-150 cursor-pointer"
              aria-label="User menu"
            >
              <Avatar className="h-7 w-7">
                <AvatarImage src={user?.avatar} alt={user?.name} />
                <AvatarFallback className="text-xs font-semibold text-[hsl(var(--primary-foreground))] bg-[hsl(var(--primary))]">
                  {getInitials(user?.name ?? "U")}
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:flex flex-col items-start">
                <span className="text-sm font-semibold text-foreground leading-tight">
                  {user?.name ?? "User"}
                </span>
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground hidden md:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-0.5">
                <span className="font-semibold text-sm">
                  {user?.name ?? "User"}
                </span>
                <span className="text-xs text-muted-foreground font-normal">
                  {user?.email}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {/* Mobile theme toggle inside dropdown */}
            <div className="sm:hidden px-1 py-1.5">
              <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Theme
              </p>
              <div className="flex items-center gap-1">
                {THEME_OPTIONS.map(({ value, icon: Icon, label }) => (
                  <button
                    key={value}
                    onClick={() => setPreference(value)}
                    className={cn(
                      "flex-1 flex flex-col items-center gap-1 py-1.5 rounded-[6px] text-[10px] font-medium transition-colors",
                      preference === value
                        ? "bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]"
                        : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]",
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
