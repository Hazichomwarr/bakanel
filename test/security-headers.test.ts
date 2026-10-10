import { describe, expect, it } from "vitest";

import nextConfig from "../next.config";
import {
  CONTENT_SECURITY_POLICY,
  securityHeaders,
  STRICT_TRANSPORT_SECURITY,
} from "../lib/security-headers";

function headerMap(environment: { NODE_ENV?: string }) {
  return Object.fromEntries(
    securityHeaders(environment).map((header) => [header.key.toLowerCase(), header.value]),
  );
}

describe("security header policy", () => {
  it("forbids framing through both CSP frame-ancestors and X-Frame-Options", () => {
    const headers = headerMap({ NODE_ENV: "production" });

    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["x-frame-options"]).toBe("DENY");
  });

  it("sets content-type, referrer, and permissions protections", () => {
    const headers = headerMap({ NODE_ENV: "production" });

    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toBe("camera=(), microphone=(), geolocation=()");
  });

  it("sends HSTS in production without subdomain or preload commitments", () => {
    expect(headerMap({ NODE_ENV: "production" })["strict-transport-security"]).toBe(
      STRICT_TRANSPORT_SECURITY,
    );
    expect(STRICT_TRANSPORT_SECURITY).toBe("max-age=31536000");
  });

  it("does not pin development or test origins to HTTPS", () => {
    expect(headerMap({ NODE_ENV: "development" })).not.toHaveProperty("strict-transport-security");
    expect(headerMap({ NODE_ENV: "test" })).not.toHaveProperty("strict-transport-security");
    expect(headerMap({})).not.toHaveProperty("strict-transport-security");
  });

  it("keeps the CSP free of script and style restrictions that would break hydration", () => {
    expect(CONTENT_SECURITY_POLICY).toBe(
      "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
    );
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/script-src|style-src|default-src|img-src/);
  });
});

describe("Next.js configuration", () => {
  it("applies the policy to every route and hides the framework header", async () => {
    const rules = await nextConfig.headers!();

    expect(nextConfig.poweredByHeader).toBe(false);
    expect(rules).toEqual([{ source: "/:path*", headers: securityHeaders(process.env) }]);
  });
});
