/**
 * auth.ts — Core auth utilities
 *
 * - JWT decode (no verification — server validates signatures)
 * - In-memory token store (avoids XSS via localStorage)
 * - Token expiry helpers
 */

export interface JwtClaims {
  sub: string;
  exp: number;
  iat: number;
  aud?: string | string[];
  iss?: string;
  // Logto-specific
  roles?: string[];
  organization_id?: string;
  organization_roles?: string[];
  organizations?: string[];
  name?: string;
  email?: string;
  picture?: string;
}

/** Decode a JWT payload without verifying the signature. */
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

/** Returns true if the token expires within `bufferSeconds` (default 60s). */
export function isTokenExpiringSoon(
  token: string,
  bufferSeconds = 60,
): boolean {
  const claims = decodeJwt(token);
  if (!claims?.exp) return true;
  return claims.exp - bufferSeconds < Math.floor(Date.now() / 1000);
}

/** Returns true if the token is already expired. */
export function isTokenExpired(token: string): boolean {
  const claims = decodeJwt(token);
  if (!claims?.exp) return true;
  return claims.exp < Math.floor(Date.now() / 1000);
}

/** Milliseconds until the token expires (0 if already expired). */
export function msUntilExpiry(token: string): number {
  const claims = decodeJwt(token);
  if (!claims?.exp) return 0;
  return Math.max(0, claims.exp * 1000 - Date.now());
}

// ── In-memory token store ────────────────────────────────────────────────────
// Tokens are never written to localStorage/sessionStorage to reduce XSS surface.
// The httpOnly cookie is the source of truth; this is just a runtime cache.

let _accessToken: string | null = null;
let _refreshPromise: Promise<string | null> | null = null;

export const tokenStore = {
  get(): string | null {
    return _accessToken;
  },
  set(token: string | null) {
    _accessToken = token;
  },
  clear() {
    _accessToken = null;
  },
  /** Deduplicated refresh — concurrent callers share one in-flight request. */
  getRefreshPromise(): Promise<string | null> | null {
    return _refreshPromise;
  },
  setRefreshPromise(p: Promise<string | null> | null) {
    _refreshPromise = p;
  },
};
