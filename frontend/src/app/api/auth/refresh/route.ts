/**
 * POST /api/auth/refresh
 *
 * Refresh token rotation endpoint.
 *
 * Flow:
 *  1. Read refresh_token from httpOnly cookie
 *  2. Exchange with Logto for a new access_token + rotated refresh_token
 *  3. If active_org_id cookie is set, exchange for an org-scoped access token
 *  4. Write new tokens to cookies (old refresh_token is now invalid)
 *  5. Return { accessToken, expiresIn, role, orgId } to the caller
 *
 * Logto rotates refresh tokens on every use by default.
 * A 401 response means the refresh token has expired — the client must re-authenticate.
 */
export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { COOKIE, cookieOpts, TTL } from "@/lib/cookies";
import { resolveSessionTokens, OidcError } from "@/lib/oidc";

export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get(COOKIE.REFRESH)?.value;
  if (!refreshToken) {
    return NextResponse.json({ error: "no_refresh_token" }, { status: 401 });
  }

  const activeOrgId = request.cookies.get(COOKIE.ACTIVE_ORG)?.value;

  let session;
  try {
    session = await resolveSessionTokens(refreshToken, activeOrgId);
  } catch (err) {
    if (err instanceof OidcError) {
      console.error("[refresh] Token refresh failed:", err.status, err.body);
      // 400/401 from Logto = refresh token expired or revoked
      return NextResponse.json({ error: "refresh_failed" }, { status: 401 });
    }
    console.error("[refresh] Unexpected error:", err);
    return NextResponse.json({ error: "server_error" }, { status: 503 });
  }

  const response = NextResponse.json({
    accessToken: session.accessToken,
    expiresIn: session.expiresIn,
    role: session.role,
    orgId: session.orgId,
  });

  response.cookies.set(COOKIE.SESSION, session.accessToken, {
    ...cookieOpts.session,
    maxAge: session.expiresIn,
  });
  response.cookies.set(COOKIE.ROLE, session.role, {
    ...cookieOpts.session,
    maxAge: session.expiresIn,
  });
  if (session.refreshToken) {
    response.cookies.set(COOKIE.REFRESH, session.refreshToken, {
      ...cookieOpts.session,
      maxAge: TTL.REFRESH_TOKEN,
    });
  }
  if (session.orgId) {
    response.cookies.set(COOKIE.ACTIVE_ORG, session.orgId, {
      ...cookieOpts.session,
      maxAge: TTL.ACTIVE_ORG,
    });
  }

  return response;
}
