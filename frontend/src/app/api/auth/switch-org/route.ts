/**
 * POST /api/auth/switch-org
 *
 * Org switching for multi-tenant RBAC:
 *  1. Validate the requested orgId is in the user's organizations list
 *  2. Exchange the refresh_token for an org-scoped access token
 *  3. Update cookies and return the new token + role
 *
 * Body: { orgId: string }
 */
export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { decodeJwt } from "@/lib/auth";

const LOGTO_SERVER_ENDPOINT =
  process.env.LOGTO_ENDPOINT ??
  process.env.NEXT_PUBLIC_LOGTO_ENDPOINT ??
  "http://localhost:3001";
const LOGTO_APP_ID = process.env.NEXT_PUBLIC_LOGTO_APP_ID ?? "";
const LOGTO_APP_SECRET = (() => {
  const v = process.env.LOGTO_APP_SECRET ?? "";
  return v && !v.startsWith("<") ? v : "";
})();
const LOGTO_API_RESOURCE =
  process.env.NEXT_PUBLIC_LOGTO_API_RESOURCE ?? "http://localhost:8001";

const cookieBase = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get("refresh_token")?.value;
  if (!refreshToken) {
    return NextResponse.json({ error: "no_session" }, { status: 401 });
  }

  let orgId: string;
  try {
    const body = await request.json();
    orgId = body.orgId;
    if (!orgId || typeof orgId !== "string") throw new Error("invalid");
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // Validate the user actually belongs to this org (check current session claims)
  const currentToken = request.cookies.get("logto_session")?.value;
  if (currentToken) {
    const claims = decodeJwt(currentToken);
    const userOrgs = claims?.organizations ?? [];
    if (userOrgs.length > 0 && !userOrgs.includes(orgId)) {
      return NextResponse.json({ error: "org_not_found" }, { status: 403 });
    }
  }

  const tokenEndpoint = `${LOGTO_SERVER_ENDPOINT}/oidc/token`;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: LOGTO_APP_ID,
    resource: LOGTO_API_RESOURCE,
    organization_id: orgId,
  });
  if (LOGTO_APP_SECRET) body.set("client_secret", LOGTO_APP_SECRET);

  let tokens: Record<string, unknown>;
  try {
    const res = await fetch(tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("[switch-org] Token exchange failed:", res.status, text);
      return NextResponse.json({ error: "exchange_failed" }, { status: 401 });
    }
    tokens = (await res.json()) as Record<string, unknown>;
  } catch (err) {
    console.error("[switch-org] Network error:", err);
    return NextResponse.json({ error: "network_error" }, { status: 503 });
  }

  const accessToken = tokens.access_token as string;
  const newRefreshToken = tokens.refresh_token as string | undefined;
  const expiresIn =
    typeof tokens.expires_in === "number" ? tokens.expires_in : 3600;

  // Extract role from new org-scoped token
  let role = "owner";
  const claims = decodeJwt(accessToken);
  if (claims) {
    const orgRoles = claims.organization_roles ?? [];
    const globalRoles = claims.roles ?? [];
    if (globalRoles.includes("superadmin")) {
      role = "superadmin";
    } else if (orgRoles.length > 0) {
      role = orgRoles[0].includes(":")
        ? orgRoles[0].split(":").pop()!
        : orgRoles[0];
    }
  }

  const response = NextResponse.json({ accessToken, expiresIn, role, orgId });

  response.cookies.set("logto_session", accessToken, {
    ...cookieBase,
    maxAge: expiresIn,
  });
  response.cookies.set("user_role", role, { ...cookieBase, maxAge: expiresIn });
  response.cookies.set("active_org_id", orgId, {
    ...cookieBase,
    maxAge: 60 * 60 * 24 * 30,
  });
  if (newRefreshToken) {
    response.cookies.set("refresh_token", newRefreshToken, {
      ...cookieBase,
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  return response;
}
