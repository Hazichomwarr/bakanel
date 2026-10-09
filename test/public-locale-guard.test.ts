import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { sessionCookieName } from "../lib/auth/cookie";
import { isUnsupportedLocalePath, publicLocales } from "../lib/public/locale-codes";
import { config as proxyConfig, proxy } from "../proxy";

const ORIGIN = "https://bakanel.test";

function request(path: string, cookie?: string) {
  return new NextRequest(`${ORIGIN}${path}`, {
    headers: cookie ? { cookie: `${sessionCookieName()}=${cookie}` } : {},
  });
}

function proxyMatches(path: string) {
  return unstable_doesMiddlewareMatch({ config: proxyConfig, url: path });
}

const unsupportedLocalePaths = [
  "/de",
  "/FR",
  "/Fr",
  "/fR",
  "/EN",
  "/Pt",
  "/xx",
  "/en-US",
  "/pt_BR",
  "/de/services",
  "/FR/services/iso",
];

const passThroughPublicPaths = [
  "/fr",
  "/en",
  "/pt",
  "/fr/",
  "/fr/services",
  "/pt/services/formation",
  "/en/services/unknown",
  "/fr/introuvable",
];

describe("locale-shaped path classification", () => {
  it.each(unsupportedLocalePaths)("classifies %s as an unsupported locale", (path) => {
    expect(isUnsupportedLocalePath(path)).toBe(true);
  });

  it.each([
    ...passThroughPublicPaths,
    "/",
    "/admin",
    "/admin/login",
    "/robots.txt",
    "/favicon.ico",
    "/images/training.png",
    "/_next/static/chunks/app.js",
    "/introuvable",
    "/abc",
    "/fra",
    "/f",
    "/en-USA",
    "/e1",
  ])("does not classify %s as an unsupported locale", (path) => {
    expect(isUnsupportedLocalePath(path)).toBe(false);
  });

  it("accepts only the exact supported codes", () => {
    expect(publicLocales).toEqual(["fr", "en", "pt"]);
  });
});

describe("proxy locale guard", () => {
  it.each(unsupportedLocalePaths)(
    "answers %s with a static, server-rendered English 404",
    async (path) => {
      const response = proxy(request(path));
      const body = await response.text();

      expect(response.status).toBe(404);
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(body).toMatch(/^<!doctype html>\n<html lang="en">/);
      expect(body).toContain('<meta name="robots" content="noindex, nofollow">');
      expect(body).toContain("<h1>404 — Page Not Found</h1>");
      expect(body).toContain(
        "Sorry, the page you're looking for doesn't exist or may have been moved.",
      );
      expect(body).toContain('<a class="home" href="/fr">Return to Homepage</a>');
      expect(body).not.toContain("<script");
    },
  );

  it("never echoes the requested path", async () => {
    const body = await proxy(request("/zz/%3Cscript%3Ealert(1)%3C%2Fscript%3E")).text();

    expect(body).not.toMatch(/zz|alert|%3C/);
  });

  it.each(passThroughPublicPaths)("lets the supported path %s reach the application", (path) => {
    const response = proxy(request(path));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});

const EXPECTED_MATCHER = [
  "/admin",
  "/admin/:path*",
  "/:locale([a-zA-Z]{2})",
  "/:locale([a-zA-Z]{2})/:path*",
  "/:locale([a-zA-Z]{2}[-_][a-zA-Z]{2})",
  "/:locale([a-zA-Z]{2}[-_][a-zA-Z]{2})/:path*",
];

/**
 * Independent, hand-written equivalents of the matcher entries above, so the contract is not
 * verified only through Next's unstable matcher-testing helper.
 */
const MATCHER_EQUIVALENTS = [
  /^\/admin$/,
  /^\/admin(\/.*)?$/,
  /^\/[a-zA-Z]{2}$/,
  /^\/[a-zA-Z]{2}(\/.*)?$/,
  /^\/[a-zA-Z]{2}[-_][a-zA-Z]{2}$/,
  /^\/[a-zA-Z]{2}[-_][a-zA-Z]{2}(\/.*)?$/,
];

function matchesEquivalent(path: string) {
  return MATCHER_EQUIVALENTS.some((pattern) => pattern.test(path));
}

const matchedPaths = [
  ...unsupportedLocalePaths,
  "/fr",
  "/en/services",
  "/pt/services/iso",
  "/admin",
  "/admin/login",
  "/admin/nonexistent/deeper",
];

const excludedPaths = [
  "/",
  "/robots.txt",
  "/favicon.ico",
  "/images/training.png",
  "/file.svg",
  "/_next/static/chunks/app.js",
  "/_next/image",
  "/introuvable",
  "/administrator",
];

describe("proxy matcher contract", () => {
  it("contains exactly the admin entries and the locale-guard entries", () => {
    expect(proxyConfig.matcher).toEqual(EXPECTED_MATCHER);
    expect(MATCHER_EQUIVALENTS).toHaveLength(EXPECTED_MATCHER.length);
  });

  it.each(matchedPaths)("runs for %s", (path) => {
    expect(matchesEquivalent(path)).toBe(true);
    expect(proxyMatches(path)).toBe(true);
  });

  it.each(excludedPaths)("does not run for %s", (path) => {
    expect(matchesEquivalent(path)).toBe(false);
    expect(proxyMatches(path)).toBe(false);
  });

  it("does not run for image optimization requests", () => {
    expect(proxyMatches("/_next/image?url=%2Fimages%2Ftraining.png&w=640&q=75")).toBe(false);
  });

  it("matches every path the classifier rejects, so no rejection is unreachable", () => {
    for (const path of unsupportedLocalePaths) {
      expect(isUnsupportedLocalePath(path)).toBe(true);
      expect(matchesEquivalent(path)).toBe(true);
    }
  });
});

describe("admin requests are unaffected by the locale guard", () => {
  it.each(["/admin", "/admin/nonexistent", "/admin/formations"])(
    "still redirects %s to login without a session cookie",
    (path) => {
      const response = proxy(request(path));

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(`${ORIGIN}/admin/login`);
    },
  );

  it.each(["/admin/login", "/admin/login/nonexistent"])(
    "still lets %s through unauthenticated",
    (path) => {
      expect(proxy(request(path)).headers.get("location")).toBeNull();
    },
  );

  it.each(["/admin", "/admin/nonexistent"])(
    "still passes %s through when a session cookie is present",
    (path) => {
      const response = proxy(request(path, "any-value"));

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    },
  );

  it.each(["/admin", "/admin/login", "/admin/nonexistent"])(
    "keeps %s within the proxy matcher",
    (path) => {
      expect(proxyMatches(path)).toBe(true);
    },
  );
});
