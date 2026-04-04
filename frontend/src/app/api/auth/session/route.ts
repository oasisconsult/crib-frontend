/**
 * GET /api/auth/session
 *
 * Returns session metadata — never the token itself.
 *
 * The client uses this to:
 *  - Know whether a session exists (200 vs 401)
 *  - Know when the token expires (for scheduling silent refresh)
 *  - Know the user's role and active org (for RBAC without a backend call)
 *
 * The access token stays in the httpOnly cookie at all times.
 * JavaScript never receives the raw token value from this endpoint.
 */
export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { COOKIE } from "@/lib/cookies";

interface JwtPayload {
  exp?: number;
  sub?: string;
  organization_id?: string;
}

function decodePayload(token: string): JwtPayload | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    return JSON.parse(
      atob(part.replace(/-/g, "+").replace(/_/g, "/")),
    ) as JwtPayload;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get(COOKIE.SESSION)?.value;

  if (!token) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  // Dev tokens (mock mode) are not JWTs — return a long-lived session
  if (token.startsWith("dev.")) {
    return NextResponse.json({
      authenticated: true,
      expiresAt: Math.floor(Date.now() / 1000) + 8 * 60 * 60, // 8h dev session
      sub: token.slice(4),
      orgId: null,
    });
  }

  const payload = decodePayload(token);
  if (!payload) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    expiresAt: payload.exp ?? 0,
    sub: payload.sub,
    orgId: payload.organization_id ?? null,
  });
}
