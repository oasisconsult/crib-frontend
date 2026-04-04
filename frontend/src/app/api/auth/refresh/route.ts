/**
 * POST /api/auth/refresh
 * ...uses Node runtime for reliable server-side env var access (LOGTO_ENDPOINT).
 */
// Node runtime — Edge cannot reliably access server-only env vars like LOGTO_ENDPOINT

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
      // Log the full Logto error body — critical for diagnosing token issues
      console.error("[refresh] Logto rejected token exchange:", {
        status: err.status,
        body: err.body,
        hasRefreshToken: !!refreshToken,
        activeOrgId: activeOrgId ?? null,
      });
      return NextResponse.json(
        { error: "refresh_failed", detail: err.body },
        { status: 401 },
      );
    }
    console.error("[refresh] Unexpected error:", err);
    return NextResponse.json({ error: "server_error" }, { status: 503 });
  }

  const response = NextResponse.json({
    accessToken: session.accessToken,
    expiresIn: session.expiresIn,
    role: session.role,
    roles: session.roles,
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
  response.cookies.set(COOKIE.ROLES, session.roles.join(","), {
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
