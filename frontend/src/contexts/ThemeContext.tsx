"use client";

/**
 * ThemeContext — single source of truth for light / dark / system theming.
 *
 * • Reads the user's preference from UIStore (persisted in localStorage).
 * • When preference is "system", mirrors prefers-color-scheme and updates live.
 * • Writes the resolved "dark" | "light" class to <html> so Tailwind's
 *   `dark:` utilities work everywhere.
 * • Exports useTheme() so any component can read / change the preference.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useUIStore } from "@/store/useUIStore";

type Preference = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  /** The user's saved preference ("light" | "dark" | "system") */
  preference: Preference;
  /** The actual applied theme after resolving "system" */
  resolved: ResolvedTheme;
  setPreference: (p: Preference) => void;
  /** Convenience — true when resolved === "dark" */
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(preference: Preference): ResolvedTheme {
  return preference === "system" ? getSystemTheme() : preference;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const preference = useUIStore((s) => s.theme) as Preference;
  const setTheme   = useUIStore((s) => s.setTheme);

  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(preference));

  /* Apply resolved theme to <html> */
  useEffect(() => {
    const root = document.documentElement;
    const next = resolveTheme(preference);
    root.classList.remove("light", "dark");
    root.classList.add(next);
    setResolved(next);
  }, [preference]);

  /* When preference is "system", track OS changes in real-time */
  useEffect(() => {
    if (preference !== "system") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      const next: ResolvedTheme = e.matches ? "dark" : "light";
      document.documentElement.classList.remove("light", "dark");
      document.documentElement.classList.add(next);
      setResolved(next);
    };

    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [preference]);

  const setPreference = useCallback((p: Preference) => setTheme(p), [setTheme]);

  return (
    <ThemeContext.Provider
      value={{ preference, resolved, setPreference, isDark: resolved === "dark" }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
