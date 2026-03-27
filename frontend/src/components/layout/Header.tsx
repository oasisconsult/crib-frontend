"use client";

import { Bell, Search, Menu, Sun, Moon, Monitor, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUIStore } from "@/store/useUIStore";
import { useAppStore } from "@/store/useAppStore";
import { getInitials } from "@/utils/formatters";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PropertySwitcher } from "./PropertySwitcher";

export function Header() {
  const { setMobileNavOpen, theme, setTheme, setCommandPaletteOpen } = useUIStore();
  const user = useAppStore((s) => s.user);

  const themeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const ThemeIcon = themeIcon;

  const cycleTheme = () => {
    setTheme(theme === "system" ? "light" : theme === "light" ? "dark" : "system");
  };

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b bg-background/95 backdrop-blur px-4 md:px-6">
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
      <Button
        variant="outline"
        className="hidden md:flex flex-1 max-w-sm items-center gap-2 text-muted-foreground justify-start px-3 h-9"
        onClick={() => setCommandPaletteOpen(true)}
        aria-label="Open search"
      >
        <Search className="h-4 w-4" />
        <span className="text-sm">Search...</span>
        <kbd className="ml-auto text-xs bg-muted rounded px-1.5 py-0.5">⌘K</kbd>
      </Button>

      <div className="ml-auto flex items-center gap-2">
        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={cycleTheme}
          aria-label={`Current theme: ${theme}. Click to change`}
        >
          <ThemeIcon className="h-4.5 w-4.5" />
        </Button>

        {/* Notifications */}
        <Button variant="ghost" size="icon" aria-label="Notifications" asChild>
          <Link href="/notifications">
            <Bell className="h-4.5 w-4.5" />
          </Link>
        </Button>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 w-9 rounded-full p-0" aria-label="User menu">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.avatar} alt={user?.name} />
                <AvatarFallback>{getInitials(user?.name ?? "U")}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-0.5">
                <span className="font-medium">{user?.name ?? "User"}</span>
                <span className="text-xs text-muted-foreground font-normal">{user?.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings">Settings</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" asChild>
              <Link href="/api/auth/logout">
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
