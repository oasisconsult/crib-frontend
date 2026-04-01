/**
 * auth.ts — Client-side auth utilities
 *
 * Token security model:
 *  - The access token lives exclusively in an httpOnly cookie (set by the server).
 *  - JavaScript never receives the raw token value — only metadata (expiry, sub).
 *  - The BFF proxy (src/app/api/v1/[...path]/route.ts) reads the cookie
 *    server-side and injects Authorization: Bearer <token> before forwarding
 *    requests to the FastAPI backend.
 *  - tokenStore holds only the expiry timestamp for scheduling silent refresh.
 *    It is NOT used to attach tokens to requests.
 *
 * What lives where:
 *  httpOnly cookie  → access token (server-readable only)
 *  httpOnly cookie  → refresh token (server-readable only)
 *  tokenStore       → expiry timestamp only (in-memory, lost on reload)
 *  Zustand store    → user profile (name, role, org — not the token)
 */

export interface JwtClaims {
  sub: string;
  exp: number;
  iat: number;
  aud?: string | string[];
  iss?: string;
  roles?: string[];
  organization_id?: string;
  organization_roles?: string[];
  organizations?: string[];
  name?: string;
  email?: string;
}

/** Decode a JWT payload without verifying the signature (server verifies). */
export function decodeJwt(token: string): JwtClaims | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(payload)) as JwtClaims;
  } catch {
    return null;
  }
}

/** Milliseconds until the given Unix timestamp (0 if already past). */
export function msUntilTimestamp(expiresAt: number): number {
  return Math.max(0, expiresAt * 1000 - Date.now());
}

// ── Token expiry store ───────────────────────────────────────────────────────
// Holds only the expiry timestamp — never the token itself.
// Used solely to schedule proactive silent refresh.
// Lost on page reload (intentional — bootstrap re-reads from the cookie).

let _expiresAt: number = 0;
let _refreshPromise: Promise<string | null> | null = null;

export const tokenStore = {
  /** Unix timestamp (seconds) when the current token expires. */
  getExpiry(): number {
    return _expiresAt;
  },
  setExpiry(expiresAt: number) {
    _expiresAt = expiresAt;
  },
  clear() {
    _expiresAt = 0;
  },
  isExpired(): boolean {
    return _expiresAt > 0 && _expiresAt < Math.floor(Date.now() / 1000);
  },
  /** Deduplicated refresh — concurrent callers share one in-flight request. */
  getRefreshPromise(): Promise<string | null> | null {
    return _refreshPromise;
  },
  setRefreshPromise(p: Promise<string | null> | null) {
    _refreshPromise = p;
  },
};
