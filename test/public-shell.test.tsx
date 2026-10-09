import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  pathname: "/fr",
  searchParams: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => navigation.pathname,
  useSearchParams: navigation.searchParams,
}));

import { PublicShell } from "../app/(public)/[locale]/_components/public-shell";
import * as serviceDetailRoute from "../app/(public)/[locale]/services/[service]/page";
import * as servicesOverviewRoute from "../app/(public)/[locale]/services/page";
import { dictionaries } from "../lib/public/content";
import { publicLocales, type PublicLocale } from "../lib/public/locale";
import { getServiceContent, serviceHref, serviceSlugs, servicesHref } from "../lib/public/services";

// During `next build`, useSearchParams() throws a client-side-rendering bailout on a
// statically prerendered route. Without a Suspense boundary that error aborts the export
// (BAK-BUILD-1: "Error occurred prerendering page /fr/services/conseil").
class PrerenderSearchParamsBailout extends Error {
  constructor() {
    super("BAILOUT_TO_CLIENT_SIDE_RENDERING: useSearchParams()");
  }
}

function renderShell(locale: PublicLocale, pathname: string, page: ReactNode) {
  navigation.pathname = pathname;

  return renderToStaticMarkup(
    <PublicShell locale={locale} dictionary={dictionaries[locale]}>
      {page}
    </PublicShell>,
  );
}

beforeEach(() => {
  navigation.searchParams.mockReset();
  navigation.searchParams.mockImplementation(() => {
    throw new PrerenderSearchParamsBailout();
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("public shell during static prerendering", () => {
  it("prerenders every service detail page in every locale when search params bail out", async () => {
    for (const locale of publicLocales) {
      const dictionary = dictionaries[locale];

      for (const service of serviceSlugs) {
        const page = await serviceDetailRoute.default({
          params: Promise.resolve({ locale, service }),
        });

        const markup = renderShell(locale, serviceHref(locale, service), page);

        expect(markup).toContain(getServiceContent(dictionary, service).name);
        expect(markup).toContain(`href="${servicesHref(locale)}"`);
        expect(markup).toContain(
          `aria-label="${dictionary.languageSelector}: ${locale.toUpperCase()}"`,
        );
      }
    }
  });

  it("prerenders the services overview in every locale when search params bail out", async () => {
    for (const locale of publicLocales) {
      const dictionary = dictionaries[locale];
      const page = await servicesOverviewRoute.default({ params: Promise.resolve({ locale }) });

      const markup = renderShell(locale, servicesHref(locale), page);

      expect(markup).toContain(dictionary.services.overview.title);
      expect(markup).toContain(
        `aria-label="${dictionary.languageSelector}: ${locale.toUpperCase()}"`,
      );
    }
  });

  it("keeps the page content and navigation outside the client-rendered selector boundary", () => {
    const markup = renderShell("fr", "/fr/services/conseil", <main>Contenu</main>);

    expect(markup).toContain("<main>Contenu</main>");
    expect(markup).toContain(`aria-label="${dictionaries.fr.navigation}"`);
    expect(markup).toContain(dictionaries.fr.homeNav);
    expect(markup).toContain(dictionaries.fr.servicesNav);
  });

  it("reads search params only for the language selector, once per header placement", () => {
    navigation.searchParams.mockReturnValue(new URLSearchParams("view=all"));

    const markup = renderShell("pt", "/pt/services", <main>Conteúdo</main>);

    expect(markup).toContain("<main>Conteúdo</main>");
    expect(markup.split(`aria-label="${dictionaries.pt.languageSelector}: PT"`)).toHaveLength(3);
    expect(navigation.searchParams).toHaveBeenCalledTimes(2);
  });
});
