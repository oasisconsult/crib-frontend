"use client";

/**
 * AuthInitializer — mounts useAuth to bootstrap the session on first render.
 * Renders nothing; purely a side-effect component placed in the dashboard layout.
 */

import { useAuth } from "@/hooks/useAuth";

export function AuthInitializer() {
  useAuth(); // bootstraps token, schedules silent refresh, loads user profile
  return null;
}
