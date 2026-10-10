import "server-only";
import { isIP } from "node:net";

type SiteUrlEnvironment = Partial<Pick<NodeJS.ProcessEnv, "NODE_ENV" | "SITE_URL">>;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function configurationError(message: string) {
  return new Error(`Invalid SITE_URL configuration: ${message}`);
}

/**
 * Returns the authoritative public origin when deployment configuration supplies one.
 *
 * This is deliberately server-only: canonical URLs must never be derived from request headers,
 * and no deployment configuration is sent to browser bundles. A missing value leaves indexing
 * disabled through `app/robots.ts` until the production hostname is explicitly configured.
 */
export function getPublicSiteUrl(environment: SiteUrlEnvironment = process.env): URL | null {
  const configuredUrl = environment.SITE_URL?.trim();

  if (!configuredUrl) {
    return null;
  }

  let siteUrl: URL;

  try {
    siteUrl = new URL(configuredUrl);
  } catch {
    throw configurationError("SITE_URL must be an absolute URL.");
  }

  if (siteUrl.protocol !== "https:") {
    throw configurationError("SITE_URL must use HTTPS.");
  }

  if (siteUrl.username || siteUrl.password) {
    throw configurationError("SITE_URL must not include credentials.");
  }

  if (siteUrl.search || siteUrl.hash || siteUrl.pathname !== "/") {
    throw configurationError("SITE_URL must contain only an origin.");
  }

  const hostname = siteUrl.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (LOOPBACK_HOSTS.has(hostname) || hostname.startsWith("127.") || isIP(hostname)) {
    throw configurationError("SITE_URL must not use an IP address or loopback host.");
  }

  if (siteUrl.port) {
    throw configurationError("SITE_URL must not include a port.");
  }

  return siteUrl;
}

export function isProduction(environment: SiteUrlEnvironment = process.env) {
  return environment.NODE_ENV === "production";
}

export function publicAbsoluteUrl(pathname: string, siteUrl = getPublicSiteUrl()) {
  if (!siteUrl) {
    return null;
  }

  return new URL(pathname, siteUrl).toString();
}
