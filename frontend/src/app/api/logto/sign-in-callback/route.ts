/**
 * GET /api/logto/sign-in-callback
 *
 * Handles the OIDC authorization code callback from Logto.
 *
 * Flow:
 *  1. Verify CSRF state
 *  2. Exchange authorization code for tokens (PKCE)
 *  3. If user belongs to an org, exchange for an org-scoped access token
 *  4. Extract role from the final access token
 *  5. Set httpOnly session cookies and redirect to post-login destination
 */
export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { APP_URL } from "@/lib/config";
import { COOKIE, cookieOpts, TTL, clearAuthCookies } from "@/lib/cookies";
import {
  exchangeCodeForTokens,
  getOrgScopedToken,
  extractRole,
  OidcError,
} from "@/lib/oidc";
import { decodeJwt } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const oidcError = searchParams.get("error");

  const loginError = (reason: string) =>
    NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(reason)}`, APP_URL),
    );

  // ── Error from IdP ────────────────────────────────────────────────────────
  if (oidcError || !code) {
    console.error(
      "[callback] IdP error:",
      oidcError ?? "no_code",
      searchParams.get("error_description"),
    );
    return loginError(oidcError ?? "no_code");
  }

  // ── CSRF state check ──────────────────────────────────────────────────────
  const storedState = request.cookies.get(COOKIE.PKCE_STATE)?.value;
  if (!stateParam || stateParam !== storedState) {
    console.error("[callback] State mismatch — possible CSRF");
    return loginError("state_mismatch");
  }

  const codeVerifier = request.cookies.get(COOKIE.PKCE_VERIFIER)?.value;
  if (!codeVerifier) {
    console.error("[callback] Missing PKCE verifier");
    return loginError("missing_verifier");
  }

  // ── Code exchange ─────────────────────────────────────────────────────────
  let tokens;
  try {
    tokens = await exchangeCodeForTokens(
      code,
      codeVerifier,
      `${APP_URL}/api/logto/sign-in-callback`,
    );
  } catch (err) {
    console.error(
      "[callback] Token exchange failed:",
      err instanceof OidcError ? err.body : err,
    );
    return loginError("token_exchange");
  }

  // ── Org-scoped access token ───────────────────────────────────────────────
  // Decode the ID token to find the user's org memberships.
  // Exchange the refresh_token for an org-scoped access token so the backend
  // receives organization_id + organization_roles in every request.
  let accessToken = tokens.access_token;
  const idClaims = decodeJwt(tokens.id_token ?? "") ?? {};
  const orgIds = (idClaims.organizations as string[] | undefined) ?? [];

  if (orgIds.length > 0 && tokens.refresh_token) {
    try {
      const orgTokens = await getOrgScopedToken(
        tokens.refresh_token,
        orgIds[0],
      );
      accessToken = orgTokens.access_token;
    } catch {
      // Non-fatal — fall back to base access token
      console.warn("[callback] Org token exchange failed, using base token");
    }
  }

  // ── Build redirect response ───────────────────────────────────────────────
  const redirectTo =
    request.cookies.get(COOKIE.POST_LOGIN_REDIRECT)?.value ?? "/";
  const response = NextResponse.redirect(new URL(redirectTo, APP_URL));

  // Clear one-time flow cookies
  response.cookies.delete(COOKIE.PKCE_VERIFIER);
  response.cookies.delete(COOKIE.PKCE_STATE);
  response.cookies.delete(COOKIE.POST_LOGIN_REDIRECT);

  // Set session cookies
  const role = extractRole(accessToken);
  const claims = decodeJwt(accessToken);

  response.cookies.set(COOKIE.SESSION, accessToken, {
    ...cookieOpts.session,
    maxAge: tokens.expires_in,
  });
  response.cookies.set(COOKIE.ROLE, role, {
    ...cookieOpts.session,
    maxAge: tokens.expires_in,
  });
  if (tokens.refresh_token) {
    response.cookies.set(COOKIE.REFRESH, tokens.refresh_token, {
      ...cookieOpts.session,
      maxAge: TTL.REFRESH_TOKEN,
    });
  }
  if (claims?.organization_id) {
    response.cookies.set(COOKIE.ACTIVE_ORG, claims.organization_id, {
      ...cookieOpts.session,
      maxAge: TTL.ACTIVE_ORG,
    });
  }

  return response;
}
