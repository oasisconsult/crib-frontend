export const runtime = "edge";

import { type NextRequest } from "next/server";
import { logtoClient, LOGTO_API_RESOURCE } from "@/lib/logto";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3010";
const COOKIE_OPTS = `; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`;
const COOKIE_SECURE =
  process.env.NODE_ENV === "production" ? "; Secure" : "";

/**
 * GET /api/logto/sign-in-callback
 *
 * Handles the Logto OIDC authorization code callback.
 *
 * Steps:
 *  1. createNodeClientFromEdgeRequest — reads the encrypted PKCE session cookie
 *  2. nodeClient.handleSignInCallback(callbackUrl) — verifies state/nonce,
 *     exchanges the authorization code for tokens, persists them in the session
 *  3. nodeClient.getContext({}) — reads ID-token claims from in-memory storage
 *  4. Extracts the user's role from organization_roles or global roles
 *  5. Returns a redirect response with:
 *       • SDK session cookie (Set-Cookie from `headers`)
 *       • logto_session=active  (compat flag for middleware)
 *       • user_role=<role>      (read by middleware for route guards)
 *       • post_login_redirect cleared
 */
export async function GET(request: NextRequest) {
  // Build the callback URL using NEXT_PUBLIC_APP_URL as the origin so it
  // matches what was registered in Logto (handles reverse-proxy / Docker).
  const requestUrl = new URL(request.url);
  const callbackUrl = new URL(
    `${requestUrl.pathname}${requestUrl.search}${requestUrl.hash}`,
    APP_URL,
  );

  // createNodeClientFromEdgeRequest sets up an in-memory CookieStorage backed
  // by the request cookies, and returns a Headers object that will accumulate
  // the Set-Cookie directives for the response.
  const { nodeClient, headers } = await logtoClient.createNodeClientFromEdgeRequest(request);

  try {
    await nodeClient.handleSignInCallback(callbackUrl.toString());
  } catch (err) {
    console.error("[sign-in-callback] handleSignInCallback failed:", err);
    return new Response(null, {
      status: 307,
      headers: { Location: `${APP_URL}/login?error=callback_failed` },
    });
  }

  // Read claims from in-memory storage (tokens are already there — no cookie read needed).
  const context = await nodeClient.getContext({});

  if (!context.isAuthenticated) {
    return new Response(null, {
      status: 307,
      headers: { Location: `${APP_URL}/login?error=not_authenticated` },
    });
  }

  // ── Role extraction ──────────────────────────────────────────────────────
  // organization_roles format: ["orgId:roleName", ...]
  // global roles format:       ["superadmin", ...]
  const orgRoles: string[] = context.claims?.organization_roles ?? [];
  const globalRoles: string[] = (context.claims as Record<string, unknown>)?.roles as string[] ?? [];

  let role = "owner"; // default for property owners / landlords
  if (globalRoles.includes("superadmin")) {
    role = "superadmin";
  } else if (orgRoles.length > 0) {
    // Extract roleName from "orgId:roleName"
    const roleName = orgRoles[0].split(":").pop() ?? "owner";
    role = roleName;
  }

  // ── Determine post-login destination ─────────────────────────────────────
  const rawRedirect = request.cookies.get("post_login_redirect")?.value;
  const redirectTo = rawRedirect ? decodeURIComponent(rawRedirect) : APP_URL;

  // ── Build response ────────────────────────────────────────────────────────
  // `headers` already contains Set-Cookie for the encrypted SDK session cookie.
  const response = new Response(null, { status: 307, headers });
  response.headers.append("Location", redirectTo);

  // Clear the one-time redirect cookie
  response.headers.append(
    "Set-Cookie",
    `post_login_redirect=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
  );
  // Compat session flag for middleware
  response.headers.append(
    "Set-Cookie",
    `logto_session=active${COOKIE_OPTS}${COOKIE_SECURE}`,
  );
  // Role cookie for middleware route guards
  response.headers.append(
    "Set-Cookie",
    `user_role=${role}${COOKIE_OPTS}${COOKIE_SECURE}`,
  );

  return response;
}
