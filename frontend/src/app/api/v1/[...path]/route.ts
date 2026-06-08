/**
 * BFF Proxy — /api/v1/[...path]
 *
 * Sits between the browser and the FastAPI backend.
 *
 * Why this exists:
 *   The access token lives in an httpOnly cookie — JavaScript cannot read it.
 *   This proxy runs server-side, reads the cookie, and injects
 *   "Authorization: Bearer <token>" before forwarding to the backend.
 *   The browser never sees or sets the Authorization header directly.
 *
 * Request path:
 *   Browser (axios, relative URL /api/v1/*)
 *     → Next.js BFF proxy (this file, reads logto_session cookie)
 *       → FastAPI backend (receives Authorization: Bearer <token>)
 *         → security.py validates JWT against Logto JWKS
 *           → returns data
 *
 * In mock mode (NEXT_PUBLIC_MOCK_API=true):
 *   MSW intercepts requests in the browser before they reach this proxy.
 *   This file is never called in mock mode.
 */

import { type NextRequest, NextResponse } from "next/server";
import { COOKIE } from "@/lib/cookies";

// Server-side backend URL — Docker-internal hostname in containers.
// For local dev on the host machine, the backend is typically exposed on 8001
// (docker-compose.local.yml maps 8001 -> 8000).
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8001";

// Public backend paths that don't require a session cookie.
// These are token-authenticated endpoints where the invite token in the URL
// IS the credential — no Logto session exists for a tenant opening their invite link.
const PUBLIC_PATH_PREFIXES = [
  // Tenant onboarding flow (flow status, preview, accept-terms, payment, sign)
  "tenants/onboarding/",
  // Landlord onboarding (token-authenticated invite acceptance)
  "landlords/onboarding/",
  // Agency onboarding (token-authenticated invite acceptance)
  "agency-invites/onboarding/",
  // Document upload presign for unauthenticated onboarding tenants
  "upload/presign/onboarding/",
  // Dev-only local storage PUT target (the URL returned by local presign)
  "upload/local/",
  // Book a Demo — public marketing-site submission (no Logto session exists
  // for an anonymous visitor booking a demo)
  "public/demo-bookings",
];

function isPublicPath(path: string[]): boolean {
  const joined = path.join("/");
  return PUBLIC_PATH_PREFIXES.some((prefix) => joined.startsWith(prefix));
}

// Headers that must not be forwarded (HTTP hop-by-hop + Next.js internals)
const SKIP_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "x-middleware-subrequest",
  "x-nextjs-data",
  "x-forwarded-host",
]);

async function proxy(
  request: NextRequest,
  path: string[],
): Promise<NextResponse> {
  const upstreamUrl = `${BACKEND_URL}/api/v1/${path.join("/")}${request.nextUrl.search}`;
  const accessToken = request.cookies.get(COOKIE.SESSION)?.value;
  const hasSessionCookie = !!accessToken;

  // If the cookie isn't present, block the request — UNLESS it's a public
  // onboarding path where the invite token in the URL is the credential.
  if (!hasSessionCookie && !isPublicPath(path)) {
    return NextResponse.json(
      { detail: "Missing session cookie (logto_session)" },
      {
        status: 401,
        headers: {
          "x-bff-has-session-cookie": "0",
          "x-bff-upstream": upstreamUrl,
        },
      },
    );
  }

  // Build forwarded headers — strip hop-by-hop, inject Authorization from cookie
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!SKIP_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  } else {
    // No session cookie — let the backend return 401 naturally
    headers.delete("Authorization");
  }

  // Forward body for mutating methods
  const body = ["GET", "HEAD"].includes(request.method)
    ? undefined
    : await request.arrayBuffer();

  let upstream: Response;
  try {
    // 10-second hard timeout so a slow/restarting backend fails fast instead
    // of leaving the browser hanging for 30+ seconds.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    try {
      upstream = await fetch(upstreamUrl, {
        method: request.method,
        headers,
        body: body && body.byteLength > 0 ? body : undefined,
        redirect: "manual", // pass redirects through to the browser
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    console.error(
      isTimeout ? "[bff] Backend timeout:" : "[bff] Backend unreachable:",
      upstreamUrl,
      err,
    );
    return NextResponse.json(
      { error: isTimeout ? "backend_timeout" : "backend_unavailable" },
      { status: 503 },
    );
  }

  // Forward response headers (strip hop-by-hop)
  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!SKIP_HEADERS.has(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  });

  // Debug signal: helps diagnose 401s (cookie missing vs token rejected).
  // Visible in the browser network tab response headers.
  responseHeaders.set("x-bff-has-session-cookie", hasSessionCookie ? "1" : "0");
  responseHeaders.set("x-bff-upstream", upstreamUrl);

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

// Export a handler for each HTTP method
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, (await ctx.params).path);
}
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, (await ctx.params).path);
}
export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, (await ctx.params).path);
}
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, (await ctx.params).path);
}
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, (await ctx.params).path);
}
