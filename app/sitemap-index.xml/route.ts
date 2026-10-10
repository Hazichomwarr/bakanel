import { getPublicSiteUrl } from "@/lib/public/site-url";
import { listPublicSitemapIds } from "@/lib/public/sitemap";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function sitemapLocation(siteUrl: URL, id: string) {
  return new URL(`/sitemap/${id}.xml`, siteUrl).toString();
}

export async function GET() {
  const siteUrl = getPublicSiteUrl();

  if (!siteUrl) {
    return new Response(null, { status: 404 });
  }

  const sitemapIds = await listPublicSitemapIds();

  if (!sitemapIds) {
    return new Response(null, { status: 404 });
  }

  const entries = sitemapIds
    .map((id) => `<sitemap><loc>${sitemapLocation(siteUrl, id)}</loc></sitemap>`)
    .join("");
  const body = `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</sitemapindex>`;

  return new Response(body, {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
}
