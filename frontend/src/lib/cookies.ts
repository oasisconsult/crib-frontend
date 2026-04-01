/**
 * Centralised cookie definitions for the auth system.
 *
 * All cookie names and options are defined here.
 * Route handlers import from this module — never hardcode cookie names elsewhere.
 *
 * Security posture:
 *  - httpOnly: true  — inaccessible to JavaScript (XSS protection)
 *  - sameSite: lax   — sent on top-level navigations, blocked on cross-site sub-requests (CSRF protection)
 *  - secure: true    — HTTPS only in production
 *  - path: /         — available to all routes
 */

import { IS_PRODUCTION } from "./config";
import type { NextResponse } from "next/server";

// ── Cookie names ─────────────────────────────────────────────────────────────

export const COOKIE = {
  /** Short-lived access token (JWT). Used by middleware for route guards. */
  SESSION: "logto_session",
  /** Long-lived refresh token. Used for silent refresh and rotation. */
  REFRESH: "refresh_token",
  /** User's role string. Read by middleware for RBAC route guards. */
  ROLE: "user_role",
  /** Currently active organisation ID. Persisted across refreshes. */
  ACTIVE_ORG: "active_org_id",
  /** One-time PKCE code_verifier. Cleared after callback. */
  PKCE_VERIFIER: "pkce_verifier",
  /** One-time OAuth state for CSRF protection. Cleared after callback. */
  PKCE_STATE: "pkce_state",
  /** Post-login destination. Cleared after callback. */
  POST_LOGIN_REDIRECT: "post_login_redirect",
} as const;

/** All cookies that must be cleared on logout. */
export const ALL_AUTH_COOKIES = Object.values(COOKIE);

// ── Cookie option presets ────────────────────────────────────────────────────

export const cookieOpts = {
  /** Standard session cookie — httpOnly, secure in prod, lax SameSite. */
  session: {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: "lax" as const,
    path: "/",
  },
  /** One-time flow cookie — same security, short TTL set at call site. */
  flow: {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: "lax" as const,
    path: "/",
  },
} as const;

// ── TTLs (seconds) ───────────────────────────────────────────────────────────

export const TTL = {
  PKCE: 5 * 60, // 5 minutes — enough for the auth flow
  POST_REDIRECT: 10 * 60, // 10 minutes
  REFRESH_TOKEN: 30 * 24 * 60 * 60, // 30 days
  ACTIVE_ORG: 30 * 24 * 60 * 60, // 30 days
} as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Clear all auth cookies on a response (logout). */
export function clearAuthCookies(response: NextResponse): void {
  const clearOpts = { ...cookieOpts.session, maxAge: 0 };
  for (const name of ALL_AUTH_COOKIES) {
    response.cookies.set(name, "", clearOpts);
  }
}
