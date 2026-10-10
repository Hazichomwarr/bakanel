/**
 * Response security headers applied to every route through `next.config.ts`.
 *
 * The Content-Security-Policy deliberately contains no `script-src` or `style-src`. A strict
 * script policy in Next.js needs a per-request nonce, which forces dynamic rendering of every
 * page; the statically prerendered public pages would lose that or break hydration. The
 * directives below restrict framing, `<base>`, form targets, and plugins without affecting
 * scripts, styles, fonts, or images.
 */
type HeaderEnvironment = Readonly<Partial<Record<"NODE_ENV", string>>>;

export type SecurityHeader = {
  key: string;
  value: string;
};

export const CONTENT_SECURITY_POLICY = [
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

/**
 * One year, without `includeSubDomains` or `preload`: those affect hosts beyond this site and
 * require a decision by the owner of the production domain.
 */
export const STRICT_TRANSPORT_SECURITY = "max-age=31536000";

export function securityHeaders(environment: HeaderEnvironment): SecurityHeader[] {
  const headers: SecurityHeader[] = [
    { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ];

  // Browsers ignore HSTS on plain-HTTP responses; development servers never send it, so a
  // local `http://localhost` origin is not pinned to HTTPS.
  if (environment.NODE_ENV === "production") {
    headers.push({ key: "Strict-Transport-Security", value: STRICT_TRANSPORT_SECURITY });
  }

  return headers;
}
