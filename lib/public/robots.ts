import "server-only";

import { getPublicSiteUrl, isProduction } from "./site-url";

export function publicRobotsText() {
  const siteUrl = getPublicSiteUrl();

  if (!isProduction() || !siteUrl) {
    return "User-Agent: *\nDisallow: /\n";
  }

  return [
    "User-Agent: *",
    "Allow: /",
    "Disallow: /admin",
    `Sitemap: ${new URL("/sitemap-index.xml", siteUrl)}`,
    `Host: ${siteUrl.origin}`,
    "",
  ].join("\n");
}
