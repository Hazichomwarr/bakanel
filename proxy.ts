import { NextResponse, type NextRequest } from "next/server";
import { sessionCookieName } from "@/lib/auth/cookie";

/**
 * Optimistic early redirect only: checks cookie presence, never validity. Every protected page and Server Action
 * authenticates independently through requireAdmin(), which is the real security boundary.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/admin/login" || pathname.startsWith("/admin/login/")) return NextResponse.next();
  if (!request.cookies.get(sessionCookieName())?.value) return NextResponse.redirect(new URL("/admin/login", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
