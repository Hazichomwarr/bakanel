// Deliberately free of `server-only` and secrets so proxy.ts can read the cookie name.

export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
export const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;

const isProduction = () => process.env.NODE_ENV === "production";

/** `__Host-` (Secure, Path=/, no Domain) is enforced by browsers, so it is only usable when the cookie is Secure. */
export function sessionCookieName(production = isProduction()) {
  return production ? "__Host-bakanel_session" : "bakanel_session";
}

export function sessionCookieOptions(expiresAt: Date, production = isProduction()) {
  return { httpOnly: true, secure: production, sameSite: "lax", path: "/", expires: expiresAt, maxAge: SESSION_TTL_SECONDS } as const;
}

export function clearedSessionCookieOptions(production = isProduction()) {
  return { httpOnly: true, secure: production, sameSite: "lax", path: "/", expires: new Date(0), maxAge: 0 } as const;
}
