export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";

// Browser-accessible Logto URL (end_session_endpoint must be browser-reachable)
const LOGTO_PUBLIC_ENDPOINT =
  process.env.NEXT_PUBLIC_LOGTO_ENDPOINT ?? "http://localhost:3001";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3010";

/**
 * GET /api/logto/sign-out
 *
 * Clears local session cookies and redirects the browser to Logto's
 * end_session_endpoint so the Logto session is also invalidated.
 * Logto will redirect back to APP_URL after sign-out.
 *
 * No server-side fetch to Logto needed — the browser follows the redirect.
 */
export async function GET(_request: NextRequest) {
  const endSessionUrl = new URL(`${LOGTO_PUBLIC_ENDPOINT}/oidc/session/end`);
  endSessionUrl.searchParams.set("post_logout_redirect_uri", APP_URL);

  const response = NextResponse.redirect(endSessionUrl.toString());

  // Clear all session/auth cookies
  const c = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 0 };
  response.cookies.set("logto_session", "", c);
  response.cookies.set("user_role", "", c);
  response.cookies.set("pkce_verifier", "", c);
  response.cookies.set("pkce_state", "", c);
  response.cookies.set("post_login_redirect", "", c);

  return response;
}
