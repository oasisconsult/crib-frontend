/**
 * oidc.ts — Logto OIDC token exchange helpers (server-side only).
 *
 * All token exchange logic lives here. Route handlers call these functions
 * instead of duplicating fetch + URLSearchParams boilerplate.
 *
 * NOTE: Constants are evaluated lazily (inside functions) rather than at
 * module load time. This ensures Edge runtime routes always read the current
 * process.env values, including server-only vars like LOGTO_ENDPOINT.
 */

import { LOGTO_APP_ID, LOGTO_APP_SECRET, API_RESOURCE } from "./config";
import { decodeJwt } from "./auth";
import type { UserRole } from "@/types";

// ALL roles that can appear in a Logto JWT.  Any role not listed here is
// silently discarded by extractRoles(), so every role used in the system
// must be present.  Order in ROLE_PRIORITY mirrors the backend priority map
// in deps.py (lower index = higher privilege).
const KNOWN_ROLES: UserRole[] = [
  "superadmin",
  "owner",
  "caretaker",   // delegated manager — org member of the owner's org
  "manager",
  "landlord",    // agency-managed landlord — scoped read access to their properties
  "maintenance",
  "tenant",
];
const ROLE_PRIORITY: UserRole[] = [
  "superadmin",
  "owner",
  "caretaker",
  "manager",
  "landlord",
  "maintenance",
  "tenant",
];

function tokenEndpoint(): string {
  const base =
    process.env.LOGTO_ENDPOINT ??
    process.env.NEXT_PUBLIC_LOGTO_ENDPOINT ??
    "http://localhost:3001";
  return `${base}/oidc/token`;
}

function revokeEndpoint(): string {
  const base =
    process.env.LOGTO_ENDPOINT ??
    process.env.NEXT_PUBLIC_LOGTO_ENDPOINT ??
    "http://localhost:3001";
  return `${base}/oidc/token/revocation`;
}

export interface TokenSet {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  token_type: string;
}

export interface SessionTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  /** Primary (highest-priority) role — for backwards compat. */
  role: UserRole;
  /** Full list of roles extracted from the JWT. */
  roles: UserRole[];
  orgId?: string;
}

// ── Internal fetch helper ────────────────────────────────────────────────────

async function postToTokenEndpoint(
  params: Record<string, string>,
): Promise<TokenSet> {
  const body = new URLSearchParams(params);
  if (LOGTO_APP_SECRET) body.set("client_secret", LOGTO_APP_SECRET);

  const url = tokenEndpoint();
  console.debug("[oidc] POST", url, "grant_type:", params.grant_type);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const isTimeout = err instanceof Error && err.name === "AbortError";
    console.error("[oidc] Fetch failed:", isTimeout ? "timeout after 10s" : err, "url:", url);
    throw new OidcError(isTimeout ? 408 : 503, isTimeout ? "token_endpoint_timeout" : String(err));
  }
  clearTimeout(timeoutId);

  if (!res.ok) {
    const text = await res.text();
    console.error("[oidc] Token endpoint error:", res.status, text, "url:", url);
    throw new OidcError(res.status, text);
  }

  return res.json() as Promise<TokenSet>;
}

export class OidcError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`OIDC error ${status}: ${body}`);
    this.name = "OidcError";
  }
}

// ── Role extraction ──────────────────────────────────────────────────────────

/**
 * Extract ALL roles from a JWT access token.
 *
 * Logto may carry roles in two claims:
 *   organization_roles — org-scoped roles, plain ("manager") or prefixed ("orgId:manager")
 *   roles              — global/app-level roles ("superadmin")
 *
 * Returns a de-duplicated, priority-ordered list.
 */
export function extractRoles(accessToken: string): UserRole[] {
  const claims = decodeJwt(accessToken);
  if (!claims) return ["tenant"];

  const globalRoles: string[] = claims.roles ?? [];
  const orgRoles: string[] = claims.organization_roles ?? [];

  const seen = new Set<UserRole>();
  const result: UserRole[] = [];

  for (const raw of [...globalRoles, ...orgRoles]) {
    // Strip optional "orgId:" prefix (ID token format)
    const name = (raw.includes(":") ? raw.split(":").pop()! : raw)
      .trim()
      .toLowerCase() as UserRole;
    if (KNOWN_ROLES.includes(name) && !seen.has(name)) {
      seen.add(name);
      result.push(name);
    }
  }

  if (result.length === 0) result.push("tenant");

  // Sort by priority so index 0 is always the highest role
  return result.sort((a, b) => ROLE_PRIORITY.indexOf(a) - ROLE_PRIORITY.indexOf(b));
}

/**
 * Extract the single highest-priority role (backwards compat).
 * Prefer extractRoles() for new code.
 */
export function extractRole(accessToken: string): UserRole {
  return extractRoles(accessToken)[0];
}

// ── Token exchange functions ─────────────────────────────────────────────────

/** Exchange an authorization code for tokens (PKCE flow). */
export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string,
): Promise<TokenSet> {
  return postToTokenEndpoint({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: LOGTO_APP_ID,
    resource: API_RESOURCE,
    code_verifier: codeVerifier,
  });
}

/** Refresh an access token. Logto rotates the refresh token on every use. */
export async function refreshAccessToken(refreshToken: string): Promise<TokenSet> {
  return postToTokenEndpoint({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: LOGTO_APP_ID,
    resource: API_RESOURCE,
  });
}

/** Exchange a refresh token for an org-scoped access token. */
export async function getOrgScopedToken(
  refreshToken: string,
  orgId: string,
): Promise<TokenSet> {
  return postToTokenEndpoint({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: LOGTO_APP_ID,
    resource: API_RESOURCE,
    organization_id: orgId,
  });
}

/** Revoke a refresh token. Errors are swallowed — logout must always succeed. */
export async function revokeToken(token: string): Promise<void> {
  try {
    const body = new URLSearchParams({
      token,
      token_type_hint: "refresh_token",
      client_id: LOGTO_APP_ID,
    });
    if (LOGTO_APP_SECRET) body.set("client_secret", LOGTO_APP_SECRET);
    await fetch(revokeEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch {
    // Revocation failure must never block logout
  }
}

/**
 * Full session token resolution:
 *  1. Refresh the base access token
 *  2. If an orgId is provided, exchange for an org-scoped token
 *  3. Extract role(s) from the final access token
 */
export async function resolveSessionTokens(
  refreshToken: string,
  activeOrgId?: string,
): Promise<SessionTokens> {
  const base = await refreshAccessToken(refreshToken);

  let accessToken = base.access_token;
  let newRefreshToken = base.refresh_token ?? refreshToken;

  if (activeOrgId) {
    try {
      const orgTokens = await getOrgScopedToken(newRefreshToken, activeOrgId);
      accessToken = orgTokens.access_token;
      // Logto rotates the refresh token on every use — capture the new one.
      // Without this, the next refresh call will fail (consumed token).
      if (orgTokens.refresh_token) {
        newRefreshToken = orgTokens.refresh_token;
      }
    } catch {
      // Fall back to base access token — org scope is best-effort
    }
  }

  const claims = decodeJwt(accessToken);
  const roles = extractRoles(accessToken);
  const orgId = claims?.organization_id ?? activeOrgId;

  return {
    accessToken,
    refreshToken: newRefreshToken,
    expiresIn: base.expires_in,
    role: roles[0],
    roles,
    orgId,
  };
}
