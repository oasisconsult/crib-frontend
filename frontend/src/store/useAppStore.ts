// "use client";

// import { create } from "zustand";
// import type { User, Property } from "@/types";

// interface AppState {
//   // Auth
//   user: User | null;
//   setUser: (user: User | null) => void;
//   isAuthenticated: boolean;
//   // Properties context
//   properties: Property[];
//   setProperties: (properties: Property[]) => void;
//   activeProperty: Property | null;
//   setActiveProperty: (property: Property | null) => void;
//   // Global loading
//   isLoading: boolean;
//   setLoading: (loading: boolean) => void;
// }

// export const useAppStore = create<AppState>()((set) => ({
//   user: null,
//   setUser: (user) => set({ user, isAuthenticated: !!user }),
//   isAuthenticated: false,

//   properties: [],
//   setProperties: (properties) => set({ properties }),
//   activeProperty: null,
//   setActiveProperty: (property) => set({ activeProperty: property }),

//   isLoading: false,
//   setLoading: (isLoading) => set({ isLoading }),
// }));

"use client";

import { create } from "zustand";
import type { User, Property } from "@/types";

interface AppState {
  user: User | null;
  setUser: (user: User | null) => void;

  isAuthenticated: boolean;
  isAuthInitialized: boolean;
  setAuthInitialized: (val: boolean) => void;

  // Active org for multi-tenant switching
  activeOrgId: string | null;
  setActiveOrg: (orgId: string | null) => void;

  properties: Property[];
  setProperties: (properties: Property[]) => void;

  activeProperty: Property | null;
  setActiveProperty: (property: Property | null) => void;

  isLoading: boolean;
  setLoading: (loading: boolean) => void;
}

export const useAppStore = create<AppState>()((set) => ({
  user: null,
  isAuthenticated: false,
  isAuthInitialized: false,
  activeOrgId: null,

  setUser: (user) => set({ user, isAuthenticated: !!user }),
  setAuthInitialized: (val) => set({ isAuthInitialized: val }),
  setActiveOrg: (orgId) => set({ activeOrgId: orgId }),

  properties: [],
  setProperties: (properties) => set({ properties }),

  activeProperty: null,
  setActiveProperty: (property) => set({ activeProperty: property }),

  isLoading: false,
  setLoading: (isLoading) => set({ isLoading }),
}));
