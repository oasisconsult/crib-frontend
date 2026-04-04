import { type NextRequest, NextResponse } from "next/server";

// ── Route classification ──────────────────────────────────────────────────────

const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/api/auth",
  "/api/logto",
  "/_next",
  "/favicon.ico",
];

const ADMIN_PREFIXES = ["/admin"];
const TENANT_PREFIXES = ["/portal"];

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

function isOnboarding(pathname: string) {
  return pathname.startsWith("/onboarding/");
}

// ── JWT helpers (no signature verification — backend owns that) ───────────────

function getTokenExp(token: string): number | null {
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

/** True if the token is a real JWT that has expired (with 10s clock skew). */
function isJwtExpired(token: string): boolean {
  const exp = getTokenExp(token);
  if (exp === null) return false; // not a JWT (e.g. dev token) — don't treat as expired
  return exp < Math.floor(Date.now() / 1000) - 10;
}

// ── Middleware ────────────────────────────────────────────────────────────────

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname) || isOnboarding(pathname)) {
    return NextResponse.next();
  }

  const sessionToken = request.cookies.get("logto_session")?.value;

  // No session at all → redirect to login
  if (!sessionToken) {
    const url = new URL("/login", request.url);
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // JWT is expired → only hard-redirect if there's no refresh token.
  // If a refresh token exists, let the page load and useAuth will silently refresh.
  if (isJwtExpired(sessionToken)) {
    const hasRefresh = !!request.cookies.get("refresh_token")?.value;
    if (!hasRefresh) {
      const url = new URL("/login", request.url);
      url.searchParams.set("redirect", pathname);
      url.searchParams.set("reason", "session_expired");
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // ── Role-based route guards ───────────────────────────────────────────────
  // Prefer the comma-separated ROLES cookie; fall back to legacy ROLE cookie.
  const rolesRaw = request.cookies.get("user_roles")?.value
    ?? request.cookies.get("user_role")?.value
    ?? "";
  const roles = rolesRaw.split(",").map((r) => r.trim()).filter(Boolean);

  if (
    ADMIN_PREFIXES.some((p) => pathname.startsWith(p)) &&
    !roles.includes("superadmin")
  ) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (
    TENANT_PREFIXES.some((p) => pathname.startsWith(p)) &&
    !roles.includes("tenant")
  ) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Redirect pure tenants (no staff role) away from the staff dashboard.
  const isStaff = ["superadmin", "owner", "manager", "maintenance"].some((r) =>
    roles.includes(r),
  );
  if (pathname === "/" && !isStaff && roles.includes("tenant")) {
    return NextResponse.redirect(new URL("/portal", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons|images|fonts).*)"],
};
