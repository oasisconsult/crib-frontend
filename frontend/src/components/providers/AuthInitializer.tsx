"use client";

import { useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import { apiGet } from "@/services/api/client";
import type { User } from "@/types";

/**
 * Fetches the current authenticated user from /api/v1/users/me
 * and hydrates the app store. Renders nothing — purely a side-effect component.
 */
export function AuthInitializer() {
  const setUser = useAppStore((s) => s.setUser);
  const user = useAppStore((s) => s.user);

  useEffect(() => {
    if (user) return; // already loaded
    apiGet<User>("/users/me")
      .then(setUser)
      .catch(() => {
        // Not authenticated or backend unavailable — leave user as null
      });
  }, [setUser, user]);

  return null;
}
