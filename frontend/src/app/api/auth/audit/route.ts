export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { BACKEND_URL } from "@/lib/config";
import { COOKIE } from "@/lib/cookies";
import { decodeJwt } from "@/lib/auth";
import type { AuditAction } from "@/lib/audit";

/**
 * POST /api/auth/audit
 *
 * Receives structured audit events from the client and forwards them to
 * the FastAPI backend (/api/v1/audit-logs).
 *
 * Security:
 *  - Requires a valid session cookie — prevents use as an open relay
 *  - Server-side fields (userId, orgId, ip, source) always override client values
 *  - Input is validated against the known AuditAction enum before forwarding
 *
 * Always returns 202 — audit failures must never affect the user experience.
 */

const VALID_ACTIONS = new Set<AuditAction>([
  "auth.login",
  "auth.logout",
  "auth.token_refresh",
  "auth.token_refresh_failed",
  "auth.org_switch",
  "auth.session_expired",
  "rbac.access_denied",
]);

export async function POST(request: NextRequest) {
  // ── Require a session — prevents open relay abuse ─────────────────────────
  const sessionToken = request.cookies.get(COOKIE.SESSION)?.value;
  if (!sessionToken) {
    return NextResponse.json(
      { ok: false, error: "no_session" },
      { status: 401 },
    );
  }

  // ── Parse and validate body ───────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const action = body.action as string | undefined;
  if (!action || !VALID_ACTIONS.has(action as AuditAction)) {
    return NextResponse.json(
      { ok: false, error: "invalid_action" },
      { status: 400 },
    );
  }

  // ── Server-side enrichment (these fields always win over client values) ───
  const claims = decodeJwt(sessionToken);
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  const event: Record<string, unknown> = {
    // Client-supplied fields (safe: action, meta, timestamp, userAgent)
    action: body.action,
    meta: body.meta,
    timestamp: body.timestamp ?? new Date().toISOString(),
    userAgent: body.userAgent,
    // Server-authoritative fields — always override client values
    userId: claims?.sub,
    orgId: claims?.organization_id,
    ip,
    source: "frontend",
  };

  // ── Forward to backend ────────────────────────────────────────────────────
  // We await with a short timeout so the Edge runtime doesn't kill the request
  // before the fetch completes, while still returning 202 quickly to the client.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    await fetch(`${BACKEND_URL}/api/v1/audit-logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify(event),
      signal: controller.signal,
    });
  } catch {
    // Backend unavailable or timed out — log and continue
    console.warn("[audit] Event dropped:", action);
  } finally {
    clearTimeout(timeout);
  }

  return NextResponse.json({ ok: true }, { status: 202 });
}
