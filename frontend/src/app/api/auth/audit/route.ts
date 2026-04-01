/**
 * POST /api/auth/audit
 *
 * Receives audit events from the client and forwards them to the FastAPI
 * backend (/api/v1/audit-logs). Enriches events with server-side context
 * (IP, user identity from session cookie).
 *
 * Events are fire-and-forget from the client — this route always returns 202.
 */
export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { decodeJwt } from "@/lib/auth";

const BACKEND_URL =
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Enrich with server-side identity
  const sessionToken = request.cookies.get("logto_session")?.value;
  const claims = sessionToken ? decodeJwt(sessionToken) : null;

  const enriched = {
    ...body,
    userId: body.userId ?? claims?.sub,
    orgId: body.orgId ?? claims?.organization_id,
    ip:
      request.headers.get("x-forwarded-for") ??
      request.headers.get("x-real-ip"),
    source: "frontend",
  };

  // Forward to backend (non-blocking)
  try {
    await fetch(`${BACKEND_URL}/api/v1/audit-logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      },
      body: JSON.stringify(enriched),
    });
  } catch {
    // Backend unavailable — log locally and continue
    console.warn(
      "[audit] Backend unavailable, event dropped:",
      enriched.action,
    );
  }

  // Always 202 — audit failures must never affect the user
  return NextResponse.json({ ok: true }, { status: 202 });
}
