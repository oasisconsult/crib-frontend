/**
 * /api/upload/local/[...key]
 *
 * Next.js proxy for the backend's local-dev file storage endpoints.
 *
 * WHY THIS EXISTS
 * ---------------
 * In development the backend's LocalStorageProvider generates presign URLs
 * that point here (e.g. /api/upload/local/documents/tenants/…/file.pdf)
 * rather than directly to the backend (http://localhost:8000/…).
 *
 * Without this proxy the browser would make a cross-origin PUT to the backend
 * (localhost:3000 → localhost:8000 or localhost:8001 inside Docker), which is
 * blocked by the Same-Origin Policy and produces a CORS null-status error.
 *
 * By routing uploads through the Next.js server we stay same-origin AND avoid
 * the port-mapping confusion that arises in Docker (browser sees :3000,
 * backend container is internal backend:8000).
 *
 * NO AUTH REQUIRED
 * ----------------
 * This route does NOT check for a session cookie.  Local uploads are used by:
 *   - Unauthenticated tenant onboarding flows (invite-token auth only)
 *   - Authenticated staff (their session cookie is irrelevant here)
 * The backend /upload/local/* endpoint is dev-only and has no access control.
 *
 * PRODUCTION
 * ----------
 * In production the storage provider is S3 / R2 / MinIO and presign URLs
 * point directly to the cloud provider — this route is never called.
 */

import { type NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8001";

// Headers that must not be forwarded (hop-by-hop)
const SKIP_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "x-middleware-subrequest",
  "x-nextjs-data",
  "x-forwarded-host",
]);

async function proxyLocalUpload(
  request: NextRequest,
  key: string[],
): Promise<NextResponse> {
  // Dev-only route. In production, storage presign URLs point directly to
  // S3/R2/MinIO — this proxy is never legitimately called. Block it explicitly
  // because the backend /upload/local/* endpoint has no access control.
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const upstreamUrl = `${BACKEND_URL}/api/v1/upload/local/${key.join("/")}`;

  const headers = new Headers();
  request.headers.forEach((value, name) => {
    if (!SKIP_HEADERS.has(name.toLowerCase())) {
      headers.set(name, value);
    }
  });

  const body = ["GET", "HEAD"].includes(request.method)
    ? undefined
    : await request.arrayBuffer();

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body: body && body.byteLength > 0 ? body : undefined,
    });
  } catch (err) {
    console.error("[upload-proxy] Backend unreachable:", upstreamUrl, err);
    return NextResponse.json({ error: "backend_unavailable" }, { status: 503 });
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, name) => {
    if (!SKIP_HEADERS.has(name.toLowerCase())) {
      responseHeaders.set(name, value);
    }
  });

  return new NextResponse(
    upstream.status === 204 ? null : upstream.body,
    {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    },
  );
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ key: string[] }> },
) {
  return proxyLocalUpload(req, (await ctx.params).key);
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ key: string[] }> },
) {
  return proxyLocalUpload(req, (await ctx.params).key);
}
