/**
 * POST /api/auth/refresh
 *
 * Refresh token rotation:
 *  1. Read refresh_token from httpOnly cookie
 *  2. Exchange with Logto for a new access_token + refresh_token
 *  3. If the user has an active org, immediately exchange for an org-scoped token
 *  4. Rotate cookies (old refresh_token is invalidated by Logto)
 *  5. Return { accessToken, expiresIn, role, orgId } to the caller
 *
 * Logto rotates refresh tokens on every use (rotation is enabled by default).
 * The old refresh_token becomes invalid after this call.
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
    return NextResponse.json({ error: "no_refresh_token" }, { status: 401 });
  }

  const tokenEndpoint = `${LOGTO_SERVER_ENDPOINT}/oidc/token`;

  // ── Step 1: Base token refresh ───────────────────────────────────────────
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: LOGTO_APP_ID,
    resource: LOGTO_API_RESOURCE,
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
      console.error("[refresh] Token refresh failed:", res.status, text);
      return NextResponse.json({ error: "refresh_failed" }, { status: 401 });
    }
    tokens = (await res.json()) as Record<string, unknown>;
  } catch (err) {
    console.error("[refresh] Network error:", err);
    return NextResponse.json({ error: "network_error" }, { status: 503 });
  }

  let accessToken = tokens.access_token as string;
  const newRefreshToken = tokens.refresh_token as string | undefined;
  const expiresIn =
    typeof tokens.expires_in === "number" ? tokens.expires_in : 3600;

  // ── Step 2: Org-scoped token (if active org cookie is set) ───────────────
  const activeOrgId = request.cookies.get("active_org_id")?.value;
  if (activeOrgId && newRefreshToken) {
    const orgBody = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: newRefreshToken,
      client_id: LOGTO_APP_ID,
      resource: LOGTO_API_RESOURCE,
      organization_id: activeOrgId,
    });
    if (LOGTO_APP_SECRET) orgBody.set("client_secret", LOGTO_APP_SECRET);

    try {
      const orgRes = await fetch(tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: orgBody,
      });
      if (orgRes.ok) {
        const orgTokens = (await orgRes.json()) as Record<string, unknown>;
        if (orgTokens.access_token)
          accessToken = orgTokens.access_token as string;
      }
    } catch {
      // Fall back to base access token
    }
  }

  // ── Step 3: Extract role from new access token ───────────────────────────
  let role = "owner";
  let orgId: string | undefined;
  const claims = decodeJwt(accessToken);
  if (claims) {
    orgId = claims.organization_id;
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

  // ── Step 4: Rotate cookies ───────────────────────────────────────────────
  const response = NextResponse.json({ accessToken, expiresIn, role, orgId });

  response.cookies.set("logto_session", accessToken, {
    ...cookieBase,
    maxAge: expiresIn,
  });
  response.cookies.set("user_role", role, {
    ...cookieBase,
    maxAge: expiresIn,
  });
  if (newRefreshToken) {
    response.cookies.set("refresh_token", newRefreshToken, {
      ...cookieBase,
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
  }

  return response;
}
