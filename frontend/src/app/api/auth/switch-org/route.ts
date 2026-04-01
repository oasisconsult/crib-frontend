/**
 * POST /api/auth/switch-org
 *
 * Switches the active organisation context for a multi-tenant user.
 *
 * Flow:
 *  1. Validate the requested orgId exists in the user's JWT claims
 *  2. Exchange the refresh_token for an org-scoped access token
 *  3. Rotate cookies with the new org context
 *
 * Body: { orgId: string }
 *
 * Returns: { accessToken, expiresIn, role, orgId }
 */
export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { COOKIE, cookieOpts, TTL } from "@/lib/cookies";
import { getOrgScopedToken, extractRole, OidcError } from "@/lib/oidc";
import { decodeJwt } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get(COOKIE.REFRESH)?.value;
  if (!refreshToken) {
    return NextResponse.json({ error: "no_session" }, { status: 401 });
  }

  let orgId: string;
  try {
    const body = (await request.json()) as { orgId?: unknown };
    if (!body.orgId || typeof body.orgId !== "string") throw new Error();
    orgId = body.orgId;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // Verify the user actually belongs to this org before issuing a token
  const currentToken = request.cookies.get(COOKIE.SESSION)?.value;
  if (currentToken) {
    const claims = decodeJwt(currentToken);
    const userOrgs = claims?.organizations ?? [];
    // Only enforce if the token actually carries org claims
    if (userOrgs.length > 0 && !userOrgs.includes(orgId)) {
      return NextResponse.json({ error: "org_not_found" }, { status: 403 });
    }
  }

  let tokens;
  try {
    tokens = await getOrgScopedToken(refreshToken, orgId);
  } catch (err) {
    if (err instanceof OidcError) {
      console.error(
        "[switch-org] Token exchange failed:",
        err.status,
        err.body,
      );
      return NextResponse.json({ error: "exchange_failed" }, { status: 401 });
    }
    return NextResponse.json({ error: "server_error" }, { status: 503 });
  }

  const role = extractRole(tokens.access_token);
  const expiresIn = tokens.expires_in;

  const response = NextResponse.json({
    accessToken: tokens.access_token,
    expiresIn,
    role,
    orgId,
  });

  response.cookies.set(COOKIE.SESSION, tokens.access_token, {
    ...cookieOpts.session,
    maxAge: expiresIn,
  });
  response.cookies.set(COOKIE.ROLE, role, {
    ...cookieOpts.session,
    maxAge: expiresIn,
  });
  response.cookies.set(COOKIE.ACTIVE_ORG, orgId, {
    ...cookieOpts.session,
    maxAge: TTL.ACTIVE_ORG,
  });
  if (tokens.refresh_token) {
    response.cookies.set(COOKIE.REFRESH, tokens.refresh_token, {
      ...cookieOpts.session,
      maxAge: TTL.REFRESH_TOKEN,
    });
  }

  return response;
}
