export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";

// Server-side Logto endpoint — may be a Docker-internal hostname.
// Set LOGTO_ENDPOINT=http://logto:3001 in docker-compose; use
// http://localhost:3001 when running Next.js directly on the host.
const LOGTO_SERVER_ENDPOINT =
  process.env.LOGTO_ENDPOINT ??
  process.env.NEXT_PUBLIC_LOGTO_ENDPOINT ??
  "http://localhost:3001";
const LOGTO_APP_ID = process.env.NEXT_PUBLIC_LOGTO_APP_ID ?? "";
// Only include client_secret if it looks like a real value (not the template placeholder).
// - Traditional Web App in Logto: fill in LOGTO_APP_SECRET from the Logto console.
// - SPA app type in Logto: leave LOGTO_APP_SECRET empty — PKCE is sufficient.
const LOGTO_APP_SECRET = (() => {
  const v = process.env.LOGTO_APP_SECRET ?? "";
  return v && !v.startsWith("<") ? v : "";
})();
const LOGTO_API_RESOURCE =
  process.env.NEXT_PUBLIC_LOGTO_API_RESOURCE ?? "http://localhost:8001";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3010";

/**
 * GET /api/logto/sign-in-callback
 *
 * Handles the Logto OIDC authorization code callback.
 *
 * Flow:
 *  1. Verify state cookie matches the state parameter (CSRF protection)
 *  2. Exchange the authorization code for tokens using the server-accessible
 *     Logto endpoint (LOGTO_ENDPOINT — Docker-internal if running in Docker)
 *  3. If the user belongs to an org, exchange the refresh_token for an
 *     org-scoped access token that carries organization_id + organization_roles
 *  4. Decode the access/ID token claims to extract the user's role
 *  5. Set httpOnly cookies:
 *       • logto_session  — the access token (Bearer for backend API calls)
 *       • user_role      — role string for middleware route guards
 *  6. Redirect to the destination stored in post_login_redirect cookie
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const logtoError = searchParams.get("error");

  if (logtoError || !code) {
    const msg = logtoError ?? "no_code";
    console.error("[sign-in-callback] Logto error:", msg, searchParams.get("error_description"));
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(msg)}`, APP_URL));
  }

  // ── State verification (CSRF) ─────────────────────────────────────────────
  const storedState = request.cookies.get("pkce_state")?.value;
  if (!stateParam || stateParam !== storedState) {
    console.error("[sign-in-callback] State mismatch");
    return NextResponse.redirect(new URL("/login?error=state_mismatch", APP_URL));
  }

  const codeVerifier = request.cookies.get("pkce_verifier")?.value;
  if (!codeVerifier) {
    console.error("[sign-in-callback] Missing PKCE verifier");
    return NextResponse.redirect(new URL("/login?error=missing_verifier", APP_URL));
  }

  // ── Exchange authorization code for tokens ────────────────────────────────
  // Uses LOGTO_SERVER_ENDPOINT which is the Docker-internal hostname when
  // the frontend is running inside Docker.
  const tokenEndpoint = `${LOGTO_SERVER_ENDPOINT}/oidc/token`;
  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: `${APP_URL}/api/logto/sign-in-callback`,
    client_id: LOGTO_APP_ID,
    code_verifier: codeVerifier,
  });
  // Include client_secret only if set (confidential app)
  if (LOGTO_APP_SECRET) tokenBody.set("client_secret", LOGTO_APP_SECRET);

  let tokens: Record<string, unknown>;
  try {
    const tokenRes = await fetch(tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody,
    });
    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      console.error("[sign-in-callback] Token exchange failed:", tokenRes.status, body);
      return NextResponse.redirect(new URL("/login?error=token_exchange", APP_URL));
    }
    tokens = await tokenRes.json() as Record<string, unknown>;
  } catch (err) {
    console.error("[sign-in-callback] Token exchange network error:", err);
    return NextResponse.redirect(new URL("/login?error=network_error", APP_URL));
  }

  // ── Decode ID token claims ───────────────────────────────────────────────
  let idClaims: Record<string, unknown> = {};
  try {
    const idTokenParts = (tokens.id_token as string | undefined)?.split(".");
    if (idTokenParts?.[1]) {
      idClaims = JSON.parse(atob(idTokenParts[1].replace(/-/g, "+").replace(/_/g, "/")));
    }
  } catch { /* malformed id_token — proceed with empty claims */ }

  // ── Org-scoped access token ──────────────────────────────────────────────
  // organizations[] in the ID token lists the user's org memberships.
  // Exchange the refresh_token for an org-scoped access token that includes
  // organization_id + organization_roles so the backend can enforce RBAC.
  const orgIds = (idClaims.organizations as string[] | undefined) ?? [];
  let accessToken = tokens.access_token as string;

  if (orgIds.length > 0 && tokens.refresh_token) {
    const orgId = orgIds[0]; // first org — user can switch later if needed
    const orgTokenBody = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token as string,
      client_id: LOGTO_APP_ID,
      resource: LOGTO_API_RESOURCE,
      organization_id: orgId,
    });
    if (LOGTO_APP_SECRET) orgTokenBody.set("client_secret", LOGTO_APP_SECRET);

    try {
      const orgRes = await fetch(tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: orgTokenBody,
      });
      if (orgRes.ok) {
        const orgTokens = await orgRes.json() as Record<string, unknown>;
        if (orgTokens.access_token) {
          accessToken = orgTokens.access_token as string;
        }
      } else {
        console.warn("[sign-in-callback] Org token exchange failed, using regular access token");
      }
    } catch { /* fall back to regular access token */ }
  }

  // ── Extract role for middleware ──────────────────────────────────────────
  // Decode the access token to read org claims (org-scoped token has plain role names;
  // ID token has "orgId:roleName" format).
  let role = "owner";
  try {
    const atParts = accessToken.split(".");
    if (atParts[1]) {
      const atClaims = JSON.parse(atob(atParts[1].replace(/-/g, "+").replace(/_/g, "/")));
      const orgRoles: string[] = atClaims.organization_roles ?? [];
      const globalRoles: string[] = atClaims.roles ?? [];
      if (globalRoles.includes("superadmin")) {
        role = "superadmin";
      } else if (orgRoles.length > 0) {
        // org-scoped token: roles are plain names; ID token: "orgId:roleName"
        role = orgRoles[0].includes(":") ? orgRoles[0].split(":").pop()! : orgRoles[0];
      }
    }
  } catch { /* use default role */ }

  // ── Build redirect response ──────────────────────────────────────────────
  const rawRedirect = request.cookies.get("post_login_redirect")?.value;
  const redirectTo = rawRedirect ? decodeURIComponent(rawRedirect) : APP_URL;

  const response = NextResponse.redirect(new URL(redirectTo, APP_URL));
  const expiresIn = typeof tokens.expires_in === "number" ? tokens.expires_in : 3600;
  const secure = process.env.NODE_ENV === "production";
  const c = { httpOnly: true, secure, sameSite: "lax" as const, path: "/" };

  // Clear one-time PKCE cookies
  response.cookies.delete("pkce_verifier");
  response.cookies.delete("pkce_state");
  response.cookies.delete("post_login_redirect");

  // Session: store the access token so /api/auth/token can return it for axios Bearer auth
  response.cookies.set("logto_session", accessToken, { ...c, maxAge: expiresIn });
  response.cookies.set("user_role", role, { ...c, maxAge: expiresIn });

  return response;
}
