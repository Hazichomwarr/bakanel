import { getPublicSitemapEntries } from "@/lib/public/sitemap";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function escapeXml(value: string) {
  return value.replace(/[<>&'\"]/g, (character) => {
    const entities: Record<string, string> = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "'": "&apos;",
      '"': "&quot;",
    };

    return entities[character];
  });
}

function sitemapXml(entries: Awaited<ReturnType<typeof getPublicSitemapEntries>>) {
  if (!entries) {
    return null;
  }

  const urls = entries
    .map((entry) => {
      const alternates = Object.entries(entry.alternates?.languages ?? {})
        .flatMap(([locale, url]) =>
          typeof url === "string"
            ? [
                `<xhtml:link rel="alternate" hreflang="${escapeXml(locale)}" href="${escapeXml(url)}" />`,
              ]
            : [],
        )
        .join("");
      const lastModified = entry.lastModified
        ? `<lastmod>${new Date(entry.lastModified).toISOString()}</lastmod>`
        : "";

      return `<url><loc>${escapeXml(entry.url)}</loc>${alternates}${lastModified}</url>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls}</urlset>`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ sitemap: string }> }) {
  const { sitemap } = await params;

  if (!sitemap.endsWith(".xml")) {
    return new Response(null, { status: 404 });
  }

  const body = sitemapXml(await getPublicSitemapEntries(sitemap.slice(0, -".xml".length)));

  if (!body) {
    return new Response(null, { status: 404 });
  }

  return new Response(body, {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
}
