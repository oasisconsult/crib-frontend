"use client";

import { Bell, Search, Menu, LogOut, Settings, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUIStore } from "@/store/useUIStore";
import { useAppStore } from "@/store/useAppStore";
import { useAuth } from "@/hooks/useAuth";
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
  const { setMobileNavOpen, setCommandPaletteOpen } = useUIStore();
  const user = useAppStore((s) => s.user);
  const { logout } = useAuth();

  return (
    <header
      className="sticky top-0 z-40 flex h-16 items-center gap-3 px-4 md:px-6 border-b"
      style={{
        background: "#FFFFFF",
        borderColor: "rgba(0,0,0,0.06)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
      }}
    >
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
        className="hidden md:flex flex-1 max-w-[380px] items-center gap-2 h-10 px-3 rounded-[8px] text-sm border transition-colors text-[#696974] cursor-pointer"
        style={{
          background: "#F1F1F5",
          borderColor: "rgba(0,0,0,0.08)",
        }}
        onClick={() => setCommandPaletteOpen(true)}
        aria-label="Open search"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">Search properties, tenants...</span>
        <kbd className="text-xs font-mono bg-white border border-gray-200 rounded px-1.5 py-0.5 text-[#696974]">
          ⌘K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-2">
        {/* Notifications */}
        <Button
          variant="ghost"
          size="icon"
          className="relative text-[#696974] hover:text-[#171725] hover:bg-[#F1F1F5] h-9 w-9 rounded-[8px]"
          aria-label="Notifications"
          asChild
        >
          <Link href="/notifications">
            <Bell className="h-5 w-5" />
            {/* Notification dot */}
            <span
              className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full border-2 border-white"
              style={{ background: "#FC5A5A" }}
            />
          </Link>
        </Button>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-2 h-9 px-2 rounded-[8px] hover:bg-[#F1F1F5] transition-colors"
              aria-label="User menu"
            >
              <Avatar className="h-7 w-7">
                <AvatarImage src={user?.avatar} alt={user?.name} />
                <AvatarFallback
                  className="text-xs font-semibold text-white"
                  style={{ background: "#0062FF" }}
                >
                  {getInitials(user?.name ?? "U")}
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:flex flex-col items-start">
                <span className="text-sm font-semibold text-[#171725] leading-tight">
                  {user?.name ?? "User"}
                </span>
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-[#696974] hidden md:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-xl border-[rgba(0,0,0,0.08)] shadow-lg">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-0.5">
                <span className="font-semibold text-sm text-[#171725]">{user?.name ?? "User"}</span>
                <span className="text-xs text-[#696974] font-normal">{user?.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings" className="gap-2 cursor-pointer">
                <Settings className="h-4 w-4 text-[#696974]" />
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
