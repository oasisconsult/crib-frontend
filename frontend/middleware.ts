import { NextRequest, NextResponse } from "next/server";

const PUBLIC_ROUTES = [
  "/login",
  "/signup",
  "/api/auth",
  "/_next",
  "/favicon.ico",
];

const TENANT_ONLY_ROUTES = ["/portal"];
const ADMIN_ONLY_ROUTES = ["/admin"];

function isPublic(pathname: string) {
  return PUBLIC_ROUTES.some((r) => pathname.startsWith(r));
}

// Onboarding token routes are always public
function isOnboardingRoute(pathname: string) {
  return pathname.startsWith("/onboarding/");
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname) || isOnboardingRoute(pathname)) {
    return NextResponse.next();
  }

  // Check for session token (set by Logto after callback)
  const sessionToken =
    request.cookies.get("logto_session")?.value ||
    request.cookies.get("__session")?.value;

  if (!sessionToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Role-based route guards — roles are embedded in the JWT claims
  // In production, decode the JWT here; for now use a role cookie set by the
  // callback handler after token exchange.
  const roleCookie = request.cookies.get("user_role")?.value ?? "";

  if (ADMIN_ONLY_ROUTES.some((r) => pathname.startsWith(r))) {
    if (roleCookie !== "superadmin") {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  if (TENANT_ONLY_ROUTES.some((r) => pathname.startsWith(r))) {
    if (roleCookie !== "tenant") {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons|images|fonts).*)",
  ],
};
