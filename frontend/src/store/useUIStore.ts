"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "light" | "dark" | "system";
type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
}

interface UIState {
  // Sidebar
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  // Theme
  theme: Theme;
  setTheme: (theme: Theme) => void;
  // Active property (multi-property context)
  activePropertyId: string | null;
  setActivePropertyId: (id: string | null) => void;
  // Toasts
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
  // Mobile nav
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
  // Command palette
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
}

let toastCounter = 0;

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

      theme: "light",
      setTheme: (theme) => set({ theme }),

      activePropertyId: null,
      setActivePropertyId: (id) => set({ activePropertyId: id }),

      toasts: [],
      addToast: (toast) =>
        set((s) => ({
          toasts: [
            ...s.toasts,
            { ...toast, id: `toast-${++toastCounter}` },
          ],
        })),
      removeToast: (id) =>
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

      mobileNavOpen: false,
      setMobileNavOpen: (open) => set({ mobileNavOpen: open }),

      commandPaletteOpen: false,
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
    }),
    {
      name: "crib:ui",
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        theme: state.theme,
        activePropertyId: state.activePropertyId,
      }),
    },
  ),
);

// Convenience toast helpers
export const toast = {
  success: (title: string, description?: string) =>
    useUIStore.getState().addToast({ type: "success", title, description }),
  error: (title: string, description?: string) =>
    useUIStore.getState().addToast({ type: "error", title, description }),
  warning: (title: string, description?: string) =>
    useUIStore.getState().addToast({ type: "warning", title, description }),
  info: (title: string, description?: string) =>
    useUIStore.getState().addToast({ type: "info", title, description }),
};
