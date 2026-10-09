import { NextResponse, type NextRequest } from "next/server";

import { sessionCookieName } from "@/lib/auth/cookie";
import { isUnsupportedLocalePath } from "@/lib/public/locale-codes";
import { notFoundResponse } from "@/lib/public/not-found-response";

function isAdminPath(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/**
 * Admin: optimistic early redirect only: checks cookie presence, never validity. Every protected page and Server
 * Action authenticates independently through requireAdmin(), which is the real security boundary.
 *
 * Public: language-tag-shaped prefixes other than fr/en/pt are rejected here with a static 404. Inside the dynamic
 * `[locale]` root layout the same rejection can only produce an empty, JavaScript-dependent error document.
 * The layout's own locale validation remains in place behind this check.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isAdminPath(pathname)) {
    if (pathname === "/admin/login" || pathname.startsWith("/admin/login/")) {
      return NextResponse.next();
    }

    if (!request.cookies.get(sessionCookieName())?.value) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }

    return NextResponse.next();
  }

  if (isUnsupportedLocalePath(pathname)) {
    return notFoundResponse();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin",
    "/admin/:path*",
    // Coarse prefilter for language-tag-shaped first segments; isUnsupportedLocalePath() decides.
    "/:locale([a-zA-Z]{2})",
    "/:locale([a-zA-Z]{2})/:path*",
    "/:locale([a-zA-Z]{2}[-_][a-zA-Z]{2})",
    "/:locale([a-zA-Z]{2}[-_][a-zA-Z]{2})/:path*",
  ],
};
