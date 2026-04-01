import { type NextRequest, NextResponse } from "next/server";

const PUBLIC_ROUTES = [
  "/login",
  "/signup",
  "/api/auth",
  "/api/logto",
  "/_next",
  "/favicon.ico",
];

const TENANT_ONLY_ROUTES = ["/portal"];
const ADMIN_ONLY_ROUTES = ["/admin"];

function isPublic(pathname: string) {
  return PUBLIC_ROUTES.some((r) => pathname.startsWith(r));
}

function isOnboardingRoute(pathname: string) {
  return pathname.startsWith("/onboarding/");
}

/** Decode JWT payload without verification (signature checked by backend). */
function decodeJwtExp(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const decoded = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    );
    return typeof decoded.exp === "number" ? decoded.exp : null;
  } catch {
    return null;
  }
}

function isExpired(token: string): boolean {
  const exp = decodeJwtExp(token);
  if (!exp) return true;
  // Allow 10s clock skew
  return exp < Math.floor(Date.now() / 1000) - 10;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname) || isOnboardingRoute(pathname)) {
    return NextResponse.next();
  }

  const sessionToken = request.cookies.get("logto_session")?.value;

  // No session → redirect to login
  if (!sessionToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Session exists but access token is expired → let the client-side silent
  // refresh handle it. We only hard-redirect if there's also no refresh_token.
  if (isExpired(sessionToken)) {
    const hasRefreshToken = !!request.cookies.get("refresh_token")?.value;
    if (!hasRefreshToken) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      loginUrl.searchParams.set("reason", "session_expired");
      return NextResponse.redirect(loginUrl);
    }
    // Has refresh token — allow through; useAuth will silently refresh
    return NextResponse.next();
  }

  // ── Role-based route guards ──────────────────────────────────────────────
  const role = request.cookies.get("user_role")?.value ?? "";

  if (ADMIN_ONLY_ROUTES.some((r) => pathname.startsWith(r))) {
    if (role !== "superadmin") {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  if (TENANT_ONLY_ROUTES.some((r) => pathname.startsWith(r))) {
    if (role !== "tenant") {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons|images|fonts).*)"],
};
