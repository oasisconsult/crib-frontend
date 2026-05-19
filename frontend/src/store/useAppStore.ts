"use client";

import { create } from "zustand";
import type { User, Property } from "@/types";

interface AppState {
  // ── Auth ──────────────────────────────────────────────────────────────────
  user: User | null;
  isAuthenticated: boolean;
  isAuthInitialized: boolean;

  /** DB-driven permission set. null = not yet fetched. ["*"] = superadmin wildcard. */
  permissions: string[] | null;
  setPermissions: (permissions: string[]) => void;

  setUser: (user: User | null) => void;

  /**
   * Atomically sets user + isAuthenticated + isAuthInitialized in one update.
   * Use this instead of calling setUser + setAuthInitialized separately to
   * prevent AuthGate from seeing an intermediate state where initialized=true
   * but authenticated=false, which would trigger a spurious redirect to /login.
   */
  resolveAuth: (user: User | null) => void;

  // ── Multi-tenant ──────────────────────────────────────────────────────────
  activeOrgId: string | null;
  setActiveOrg: (orgId: string | null) => void;

  // ── Properties ────────────────────────────────────────────────────────────
  properties: Property[];
  setProperties: (properties: Property[]) => void;
  activeProperty: Property | null;
  setActiveProperty: (property: Property | null) => void;

  // ── Global loading ────────────────────────────────────────────────────────
  isLoading: boolean;
  setLoading: (loading: boolean) => void;
}

export const useAppStore = create<AppState>()((set) => ({
  user: null,
  isAuthenticated: false,
  isAuthInitialized: false,
  activeOrgId: null,

  permissions: null,
  setPermissions: (permissions) => set({ permissions }),

  setUser: (user) => set({ user, isAuthenticated: !!user }),

  resolveAuth: (user) =>
    set({ user, isAuthenticated: !!user, isAuthInitialized: true }),

  setActiveOrg: (orgId) => set({ activeOrgId: orgId }),

  properties: [],
  setProperties: (properties) => set({ properties }),

  activeProperty: null,
  setActiveProperty: (property) => set({ activeProperty: property }),

  isLoading: false,
  setLoading: (isLoading) => set({ isLoading }),
}));
