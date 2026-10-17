"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { WHATSAPP_CONTACT_URL } from "@/lib/public/contact";
import type { PublicDictionary } from "@/lib/public/content";
import { isPublicLocale, publicHref, publicLocales, type PublicLocale } from "@/lib/public/locale";
import { getServiceContent, serviceHref, serviceSlugs, servicesHref } from "@/lib/public/services";
import {
  localizedTrainingCatalogueHref,
  trainingCatalogueHref,
} from "@/lib/public/training-routes";

type NavigationItem = {
  href: string;
  label: string;
  current?: "page" | "true";
};

type TrainingNavigationTopic = {
  name: string;
  slug: string;
};

type TrainingNavigationDomain = TrainingNavigationTopic & {
  topics: TrainingNavigationTopic[];
};

type TrainingNavigation = {
  domains: TrainingNavigationDomain[];
};

type TrainingNavigationState =
  | { status: "idle" | "loading" | "unavailable" }
  | { status: "available"; navigation: TrainingNavigation };

function servicesAriaCurrent(pathname: string, servicesPath: string, inServices: boolean) {
  if (pathname === servicesPath) {
    return "page";
  }

  if (inServices) {
    return "true";
  }

  return undefined;
}

function serviceNavigationItems(
  locale: PublicLocale,
  dictionary: PublicDictionary,
  pathname: string,
): NavigationItem[] {
  const overviewPath = servicesHref(locale);

  return [
    {
      href: overviewPath,
      label: dictionary.allServicesNav,
      current: pathname === overviewPath ? "page" : undefined,
    },
    ...serviceSlugs.map((slug) => {
      const href = serviceHref(locale, slug);
      const current: NavigationItem["current"] = pathname === href ? "page" : undefined;

      return {
        href,
        label: getServiceContent(dictionary, slug).name,
        current,
      };
    }),
  ];
}

function isTrainingNavigation(value: unknown): value is TrainingNavigation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const domains = (value as { domains?: unknown }).domains;
  return (
    Array.isArray(domains) &&
    domains.every(
      (domain) =>
        domain &&
        typeof domain === "object" &&
        typeof (domain as TrainingNavigationDomain).name === "string" &&
        typeof (domain as TrainingNavigationDomain).slug === "string" &&
        Array.isArray((domain as TrainingNavigationDomain).topics) &&
        (domain as TrainingNavigationDomain).topics.every(
          (topic) =>
            topic &&
            typeof topic === "object" &&
            typeof (topic as TrainingNavigationTopic).name === "string" &&
            typeof (topic as TrainingNavigationTopic).slug === "string",
        ),
    )
  );
}

function trainingNavigationHref(
  locale: PublicLocale,
  filter: { kind: "domain" | "topic"; slug: string },
) {
  const query = new URLSearchParams({ [filter.kind]: filter.slug });
  return `${trainingCatalogueHref(locale)}?${query.toString()}`;
}

type TrainingLocaleTargets = Partial<Record<PublicLocale, string>>;

function isTrainingDetailPath(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  return (
    segments.length === 3 &&
    isPublicLocale(segments[0]) &&
    segments[1] === "formations" &&
    segments[2].length > 0
  );
}

function readTrainingLocaleTargets(pathname: string): TrainingLocaleTargets | null {
  if (typeof document === "undefined" || !isTrainingDetailPath(pathname)) {
    return null;
  }

  const targetElement = document.querySelector<HTMLElement>(
    "[data-public-training-locale-targets]",
  );
  const serializedTargets = targetElement?.dataset.publicTrainingLocaleTargets;
  if (!serializedTargets) {
    return null;
  }

  try {
    const parsedTargets: unknown = JSON.parse(serializedTargets);
    if (!parsedTargets || typeof parsedTargets !== "object" || Array.isArray(parsedTargets)) {
      return null;
    }

    const targets: TrainingLocaleTargets = {};
    for (const locale of publicLocales) {
      const target = (parsedTargets as Record<string, unknown>)[locale];
      const prefix = `${trainingCatalogueHref(locale)}/`;

      if (typeof target === "string" && target.startsWith(prefix)) {
        targets[locale] = target;
      }
    }

    return targets;
  } catch {
    return null;
  }
}

function selectorHref({
  pathname,
  target,
  search,
  hash,
}: {
  pathname: string;
  target: PublicLocale;
  search: string;
  hash: string;
}) {
  if (isTrainingDetailPath(pathname)) {
    return readTrainingLocaleTargets(pathname)?.[target] ?? trainingCatalogueHref(target);
  }

  return localizedTrainingCatalogueHref(pathname, target, search, hash);
}

function LanguageSelector({
  locale,
  dictionary,
  languageHref,
}: {
  locale: PublicLocale;
  dictionary: PublicDictionary;
  languageHref: (target: PublicLocale) => string;
}) {
  const [open, setOpen] = useState(false);
  const selector = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const dismiss = (event: MouseEvent) => {
      if (!selector.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };

    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={selector} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`${dictionary.languageSelector}: ${locale.toUpperCase()}`}
        className="wb-focus inline-flex min-h-10 items-center gap-1 px-2 text-sm font-medium"
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        <span>{locale.toUpperCase()}</span>
        <span aria-hidden="true" className="text-xs">
          ▾
        </span>
      </button>
      {open ? (
        <nav
          aria-label={dictionary.languageSelector}
          className="absolute right-0 z-50 mt-2 min-w-24 border border-[var(--wb-rule)] bg-[var(--wb-paper)] p-1 shadow-[0_12px_28px_rgba(24,33,29,0.16)]"
        >
          {publicLocales.map((item) => (
            <Link
              key={item}
              href={languageHref(item)}
              hrefLang={item}
              lang={item}
              aria-current={item === locale ? "page" : undefined}
              className="wb-focus flex min-h-10 items-center px-3 text-sm hover:bg-[var(--wb-green-soft)]"
              onClick={() => setOpen(false)}
            >
              {item.toUpperCase()}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}

function SearchAwareLanguageSelector({
  locale,
  dictionary,
  pathname,
  hash,
}: {
  locale: PublicLocale;
  dictionary: PublicDictionary;
  pathname: string;
  hash: string;
}) {
  const search = useSearchParams().toString();

  return (
    <LanguageSelector
      locale={locale}
      dictionary={dictionary}
      languageHref={(target) => selectorHref({ pathname, target, search, hash })}
    />
  );
}

// useSearchParams() bails out of static prerendering up to the nearest Suspense boundary.
// Keeping that boundary around the selector alone lets the rest of every public page
// prerender; the fallback is the same selector without the request query string.
function PublicLanguageSelector({
  locale,
  dictionary,
  pathname,
  hash,
}: {
  locale: PublicLocale;
  dictionary: PublicDictionary;
  pathname: string;
  hash: string;
}) {
  const fallback = (
    <LanguageSelector
      locale={locale}
      dictionary={dictionary}
      languageHref={(target) =>
        selectorHref({
          pathname,
          target,
          search: "",
          hash,
        })
      }
    />
  );

  return (
    <Suspense fallback={fallback}>
      <SearchAwareLanguageSelector
        locale={locale}
        dictionary={dictionary}
        pathname={pathname}
        hash={hash}
      />
    </Suspense>
  );
}

export function PublicShell({
  locale,
  dictionary,
  children,
}: {
  locale: PublicLocale;
  dictionary: PublicDictionary;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [desktopTrainingsOpen, setDesktopTrainingsOpen] = useState(false);
  const [desktopServicesOpen, setDesktopServicesOpen] = useState(false);
  const [mobileTrainingsOpen, setMobileTrainingsOpen] = useState(false);
  const [mobileServicesOpen, setMobileServicesOpen] = useState(false);
  const [trainingNavigation, setTrainingNavigation] = useState<TrainingNavigationState>({
    status: "idle",
  });
  const [trainingSearch, setTrainingSearch] = useState("");
  const [hash, setHash] = useState("");
  const pathname = usePathname() ?? publicHref(locale);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const desktopTrainingsDisclosure = useRef<HTMLDivElement>(null);
  const desktopTrainingsTrigger = useRef<HTMLButtonElement>(null);
  const desktopServicesDisclosure = useRef<HTMLDivElement>(null);
  const desktopServicesTrigger = useRef<HTMLButtonElement>(null);
  const navigationRequest = useRef(0);
  const navigationAbortController = useRef<AbortController | null>(null);
  const navigationLocale = useRef(locale);
  const servicesPath = servicesHref(locale);
  const inServices = pathname === servicesPath || pathname.startsWith(`${servicesPath}/`);
  const servicesCurrent = servicesAriaCurrent(pathname, servicesPath, inServices);
  const homePath = publicHref(locale);
  const trainingsPath = trainingCatalogueHref(locale);

  useEffect(() => {
    const updateHash = () => setHash(window.location.hash);

    updateHash();
    window.addEventListener("hashchange", updateHash);
    window.addEventListener("popstate", updateHash);

    return () => {
      window.removeEventListener("hashchange", updateHash);
      window.removeEventListener("popstate", updateHash);
    };
  }, [pathname]);

  useEffect(() => {
    navigationLocale.current = locale;
    navigationAbortController.current?.abort();
  }, [locale]);

  useEffect(() => {
    if (!desktopTrainingsOpen) {
      return;
    }

    const dismissOnPointerOutside = (event: PointerEvent) => {
      if (!desktopTrainingsDisclosure.current?.contains(event.target as Node)) {
        setDesktopTrainingsOpen(false);
      }
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDesktopTrainingsOpen(false);
        desktopTrainingsTrigger.current?.focus();
      }
    };

    document.addEventListener("pointerdown", dismissOnPointerOutside);
    document.addEventListener("keydown", dismissOnEscape);

    return () => {
      document.removeEventListener("pointerdown", dismissOnPointerOutside);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [desktopTrainingsOpen]);

  useEffect(() => {
    if (!desktopServicesOpen) {
      return;
    }

    const dismissOnPointerOutside = (event: PointerEvent) => {
      if (!desktopServicesDisclosure.current?.contains(event.target as Node)) {
        setDesktopServicesOpen(false);
      }
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDesktopServicesOpen(false);
        desktopServicesTrigger.current?.focus();
      }
    };

    document.addEventListener("pointerdown", dismissOnPointerOutside);
    document.addEventListener("keydown", dismissOnEscape);

    return () => {
      document.removeEventListener("pointerdown", dismissOnPointerOutside);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [desktopServicesOpen]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const first = panel.current?.querySelector<HTMLElement>("a,button");
    first?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
        return;
      }

      if (event.key === "Tab" && panel.current) {
        const focusable = [
          ...panel.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"),
        ];
        const firstFocusable = focusable[0];
        const lastFocusable = focusable.at(-1);

        if (event.shiftKey && document.activeElement === firstFocusable) {
          event.preventDefault();
          lastFocusable?.focus();
        } else if (!event.shiftKey && document.activeElement === lastFocusable) {
          event.preventDefault();
          firstFocusable?.focus();
        }
      }
    };

    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [open]);

  useEffect(() => {
    return () => navigationAbortController.current?.abort();
  }, []);

  const loadTrainingNavigation = () => {
    navigationAbortController.current?.abort();

    const abortController = new AbortController();
    const requestId = navigationRequest.current + 1;
    navigationRequest.current = requestId;
    navigationAbortController.current = abortController;
    setTrainingNavigation({ status: "loading" });

    void fetch(`/api/public/${locale}/training-navigation`, {
      cache: "no-store",
      signal: abortController.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Training navigation request failed.");
        }

        const responseBody: unknown = await response.json();
        if (!isTrainingNavigation(responseBody)) {
          throw new Error("Training navigation response is invalid.");
        }

        if (
          requestId === navigationRequest.current &&
          navigationLocale.current === locale &&
          !abortController.signal.aborted
        ) {
          setTrainingNavigation({ status: "available", navigation: responseBody });
        }
      })
      .catch(() => {
        if (
          requestId === navigationRequest.current &&
          navigationLocale.current === locale &&
          !abortController.signal.aborted
        ) {
          setTrainingNavigation({ status: "unavailable" });
        }
      });
  };

  const toggleDesktopTrainings = () => {
    if (desktopTrainingsOpen) {
      setDesktopTrainingsOpen(false);
      return;
    }

    setDesktopTrainingsOpen(true);
    loadTrainingNavigation();
  };

  const toggleMobileTrainings = () => {
    if (mobileTrainingsOpen) {
      setMobileTrainingsOpen(false);
      return;
    }

    setMobileTrainingsOpen(true);
    loadTrainingNavigation();
  };

  const selectTrainingFilter = (filter: { kind: "domain" | "topic"; slug: string } | null) => {
    setTrainingSearch(filter ? `?${new URLSearchParams({ [filter.kind]: filter.slug })}` : "");
  };

  const navigationItems: NavigationItem[] = [
    {
      href: homePath,
      label: dictionary.homeNav,
      current: pathname === homePath ? "page" : undefined,
    },
    { href: `${homePath}#a-propos`, label: dictionary.aboutNav },
  ];
  const serviceItems = serviceNavigationItems(locale, dictionary, pathname);
  const trainingsCurrent =
    pathname === trainingsPath || pathname.startsWith(`${trainingsPath}/`) ? "page" : undefined;
  const activeTrainingFilter = new URLSearchParams(trainingSearch);

  return (
    <>
      <a href="#public-content" className="sr-only focus:not-sr-only">
        {dictionary.skipToContent}
      </a>
      <header className="border-b border-[var(--wb-rule)] bg-[var(--wb-paper)]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-3 sm:px-5 md:grid md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:gap-6">
          <Link
            href={homePath}
            className="wb-focus wb-mono shrink-0 text-base font-semibold tracking-tight sm:text-lg md:justify-self-start"
          >
            W&apos;BAKENEL
          </Link>

          <div className="flex items-center gap-1 md:hidden">
            <PublicLanguageSelector
              locale={locale}
              dictionary={dictionary}
              pathname={pathname}
              hash={hash}
            />
            <button
              ref={trigger}
              type="button"
              className="wb-focus min-h-10 px-2 text-sm font-medium"
              aria-expanded={open}
              aria-controls="public-mobile-navigation"
              onClick={() => setOpen(true)}
            >
              {dictionary.menu}
            </button>
          </div>

          <nav
            className="hidden items-center justify-self-center gap-1 whitespace-nowrap md:flex"
            aria-label={dictionary.navigation}
          >
            {navigationItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={item.current}
                className={`wb-focus inline-flex min-h-10 items-center px-2 text-sm leading-none font-medium ${
                  item.current ? "underline underline-offset-4" : ""
                }`}
              >
                {item.label}
              </Link>
            ))}
            <div
              ref={desktopTrainingsDisclosure}
              className="relative flex items-center"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setDesktopTrainingsOpen(false);
                }
              }}
            >
              <Link
                href={trainingsPath}
                aria-current={trainingsCurrent}
                className={`wb-focus inline-flex min-h-10 items-center px-2 text-sm leading-none font-medium ${
                  trainingsCurrent ? "underline underline-offset-4" : ""
                }`}
                onClick={() => {
                  selectTrainingFilter(null);
                  setDesktopTrainingsOpen(false);
                }}
              >
                {dictionary.trainingsNav}
              </Link>
              <button
                ref={desktopTrainingsTrigger}
                type="button"
                aria-controls="public-desktop-trainings-navigation"
                aria-expanded={desktopTrainingsOpen}
                aria-label={
                  desktopTrainingsOpen ? dictionary.closeTrainingsNav : dictionary.openTrainingsNav
                }
                className="wb-focus inline-flex min-h-10 min-w-10 items-center justify-center text-sm"
                onClick={toggleDesktopTrainings}
              >
                <span aria-hidden="true">▾</span>
              </button>
              {desktopTrainingsOpen ? (
                <div
                  id="public-desktop-trainings-navigation"
                  className="absolute top-full left-0 z-50 mt-2 max-h-[min(32rem,calc(100vh-5rem))] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto whitespace-normal border border-[var(--wb-rule)] bg-[var(--wb-paper)] p-1 shadow-[0_12px_28px_rgba(24,33,29,0.16)]"
                >
                  <Link
                    href={trainingsPath}
                    aria-current={
                      pathname === trainingsPath && !trainingSearch ? "page" : undefined
                    }
                    className="wb-focus flex min-h-10 min-w-0 items-center break-words px-3 py-2 text-sm leading-5 font-medium whitespace-normal hover:bg-[var(--wb-green-soft)]"
                    onClick={() => {
                      selectTrainingFilter(null);
                      setDesktopTrainingsOpen(false);
                    }}
                  >
                    {dictionary.trainingCatalogue.allProgrammesLabel}
                  </Link>
                  {trainingNavigation.status === "loading" ? (
                    <p
                      className="px-3 py-2 text-sm text-[var(--wb-muted)]"
                      role="status"
                      aria-live="polite"
                    >
                      {dictionary.trainingsNavigationLoading}
                    </p>
                  ) : null}
                  {trainingNavigation.status === "unavailable" ? (
                    <p className="px-3 py-2 text-sm text-[var(--wb-muted)]" role="status">
                      {dictionary.trainingsNavigationUnavailable}
                    </p>
                  ) : null}
                  {trainingNavigation.status === "available" &&
                  trainingNavigation.navigation.domains.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-[var(--wb-muted)]" role="status">
                      {dictionary.trainingsNavigationEmpty}
                    </p>
                  ) : null}
                  {trainingNavigation.status === "available"
                    ? trainingNavigation.navigation.domains.map((domain) => (
                        <div key={domain.slug} className="border-t border-[var(--wb-rule)] py-1">
                          <Link
                            href={trainingNavigationHref(locale, {
                              kind: "domain",
                              slug: domain.slug,
                            })}
                            aria-current={
                              activeTrainingFilter.get("domain") === domain.slug
                                ? "page"
                                : undefined
                            }
                            className="wb-focus flex min-h-10 min-w-0 items-center break-words px-3 py-2 text-sm leading-5 font-medium whitespace-normal hover:bg-[var(--wb-green-soft)]"
                            onClick={() => {
                              selectTrainingFilter({ kind: "domain", slug: domain.slug });
                              setDesktopTrainingsOpen(false);
                            }}
                          >
                            {domain.name}
                          </Link>
                          {domain.topics.map((topic) => (
                            <Link
                              key={topic.slug}
                              href={trainingNavigationHref(locale, {
                                kind: "topic",
                                slug: topic.slug,
                              })}
                              aria-current={
                                activeTrainingFilter.get("topic") === topic.slug
                                  ? "page"
                                  : undefined
                              }
                              className="wb-focus flex min-h-10 min-w-0 items-center break-words px-6 py-2 text-sm leading-5 text-[var(--wb-muted)] whitespace-normal hover:bg-[var(--wb-green-soft)] hover:text-[var(--wb-ink)]"
                              onClick={() => {
                                selectTrainingFilter({ kind: "topic", slug: topic.slug });
                                setDesktopTrainingsOpen(false);
                              }}
                            >
                              {topic.name}
                            </Link>
                          ))}
                        </div>
                      ))
                    : null}
                </div>
              ) : null}
            </div>
            <div
              ref={desktopServicesDisclosure}
              className="relative flex items-center"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setDesktopServicesOpen(false);
                }
              }}
            >
              <Link
                href={servicesPath}
                aria-current={servicesCurrent}
                className={`wb-focus inline-flex min-h-10 items-center px-2 text-sm leading-none font-medium ${
                  servicesCurrent ? "underline underline-offset-4" : ""
                }`}
                onClick={() => setDesktopServicesOpen(false)}
              >
                {dictionary.servicesNav}
              </Link>
              <button
                ref={desktopServicesTrigger}
                type="button"
                aria-controls="public-desktop-services-navigation"
                aria-expanded={desktopServicesOpen}
                aria-label={
                  desktopServicesOpen ? dictionary.closeServicesNav : dictionary.openServicesNav
                }
                className="wb-focus inline-flex min-h-10 min-w-10 items-center justify-center text-sm"
                onClick={() => setDesktopServicesOpen((isOpen) => !isOpen)}
              >
                <span aria-hidden="true">▾</span>
              </button>
              {desktopServicesOpen ? (
                <div
                  id="public-desktop-services-navigation"
                  className="absolute top-full left-0 z-50 mt-2 max-h-[min(32rem,calc(100vh-5rem))] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto whitespace-normal border border-[var(--wb-rule)] bg-[var(--wb-paper)] p-1 shadow-[0_12px_28px_rgba(24,33,29,0.16)]"
                >
                  {serviceItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={item.current}
                      className="wb-focus flex min-h-10 min-w-0 items-center break-words px-3 py-2 text-sm leading-5 font-medium whitespace-normal hover:bg-[var(--wb-green-soft)]"
                      onClick={() => setDesktopServicesOpen(false)}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          </nav>
          <div className="hidden items-center justify-self-end gap-2 md:flex">
            <PublicLanguageSelector
              locale={locale}
              dictionary={dictionary}
              pathname={pathname}
              hash={hash}
            />
            <a
              href={WHATSAPP_CONTACT_URL}
              className="wb-focus inline-flex min-h-10 items-center border border-[var(--wb-green-deep)] px-3 text-sm leading-none font-medium"
            >
              {dictionary.contact}
            </a>
          </div>
        </div>
      </header>
      {open ? (
        <div className="fixed inset-0 z-50 bg-black/30">
          <aside
            id="public-mobile-navigation"
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={dictionary.navigation}
            className="ml-auto h-full w-72 max-w-[calc(100%-2rem)] bg-[var(--wb-paper)] p-6"
          >
            <button
              type="button"
              className="wb-focus min-h-10 text-sm font-medium"
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              {dictionary.closeMenu}
            </button>
            <nav className="mt-8 flex flex-col gap-3" aria-label={dictionary.navigation}>
              {navigationItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={item.current}
                  className="wb-focus min-h-10 text-lg font-medium"
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
              <section>
                <button
                  type="button"
                  aria-controls="public-mobile-trainings-navigation"
                  aria-expanded={mobileTrainingsOpen}
                  className="wb-focus flex min-h-10 w-full items-center justify-between text-left text-lg font-medium"
                  onClick={toggleMobileTrainings}
                >
                  <span>{dictionary.trainingsNav}</span>
                  <span aria-hidden="true">{mobileTrainingsOpen ? "▴" : "▾"}</span>
                </button>
                {mobileTrainingsOpen ? (
                  <div
                    id="public-mobile-trainings-navigation"
                    className="mt-2 ml-2 flex flex-col border-l border-[var(--wb-rule)] pl-3"
                  >
                    <Link
                      href={trainingsPath}
                      aria-current={
                        pathname === trainingsPath && !trainingSearch ? "page" : undefined
                      }
                      className="wb-focus flex min-h-10 items-center text-base font-medium"
                      onClick={() => {
                        selectTrainingFilter(null);
                        setMobileTrainingsOpen(false);
                        setOpen(false);
                      }}
                    >
                      {dictionary.trainingCatalogue.allProgrammesLabel}
                    </Link>
                    {trainingNavigation.status === "loading" ? (
                      <p
                        className="py-2 text-sm text-[var(--wb-muted)]"
                        role="status"
                        aria-live="polite"
                      >
                        {dictionary.trainingsNavigationLoading}
                      </p>
                    ) : null}
                    {trainingNavigation.status === "unavailable" ? (
                      <p className="py-2 text-sm text-[var(--wb-muted)]" role="status">
                        {dictionary.trainingsNavigationUnavailable}
                      </p>
                    ) : null}
                    {trainingNavigation.status === "available" &&
                    trainingNavigation.navigation.domains.length === 0 ? (
                      <p className="py-2 text-sm text-[var(--wb-muted)]" role="status">
                        {dictionary.trainingsNavigationEmpty}
                      </p>
                    ) : null}
                    {trainingNavigation.status === "available"
                      ? trainingNavigation.navigation.domains.map((domain) => (
                          <div key={domain.slug} className="border-t border-[var(--wb-rule)] py-1">
                            <Link
                              href={trainingNavigationHref(locale, {
                                kind: "domain",
                                slug: domain.slug,
                              })}
                              aria-current={
                                activeTrainingFilter.get("domain") === domain.slug
                                  ? "page"
                                  : undefined
                              }
                              className="wb-focus flex min-h-10 items-center text-base font-medium"
                              onClick={() => {
                                selectTrainingFilter({ kind: "domain", slug: domain.slug });
                                setMobileTrainingsOpen(false);
                                setOpen(false);
                              }}
                            >
                              {domain.name}
                            </Link>
                            {domain.topics.map((topic) => (
                              <Link
                                key={topic.slug}
                                href={trainingNavigationHref(locale, {
                                  kind: "topic",
                                  slug: topic.slug,
                                })}
                                aria-current={
                                  activeTrainingFilter.get("topic") === topic.slug
                                    ? "page"
                                    : undefined
                                }
                                className="wb-focus flex min-h-10 items-center pl-3 text-sm text-[var(--wb-muted)]"
                                onClick={() => {
                                  selectTrainingFilter({ kind: "topic", slug: topic.slug });
                                  setMobileTrainingsOpen(false);
                                  setOpen(false);
                                }}
                              >
                                {topic.name}
                              </Link>
                            ))}
                          </div>
                        ))
                      : null}
                  </div>
                ) : null}
              </section>
              <section>
                <button
                  type="button"
                  aria-controls="public-mobile-services-navigation"
                  aria-expanded={mobileServicesOpen}
                  className="wb-focus flex min-h-10 w-full items-center justify-between text-left text-lg font-medium"
                  onClick={() => setMobileServicesOpen((isOpen) => !isOpen)}
                >
                  <span>{dictionary.servicesNav}</span>
                  <span aria-hidden="true">{mobileServicesOpen ? "▴" : "▾"}</span>
                </button>
                {mobileServicesOpen ? (
                  <div
                    id="public-mobile-services-navigation"
                    className="mt-2 ml-2 flex flex-col border-l border-[var(--wb-rule)] pl-3"
                  >
                    {serviceItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={item.current}
                        className="wb-focus flex min-h-10 items-center text-base font-medium"
                        onClick={() => {
                          setMobileServicesOpen(false);
                          setOpen(false);
                        }}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </section>
              <a className="wb-focus mt-4 min-h-10 text-lg font-medium" href={WHATSAPP_CONTACT_URL}>
                {dictionary.contact}
              </a>
            </nav>
          </aside>
        </div>
      ) : null}
      <main id="public-content">{children}</main>
      <footer className="bg-[var(--wb-green-deep)] text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-4 px-5 py-8 text-sm">
          <span>W&apos;BAKENEL · {dictionary.descriptor}</span>
          <a className="wb-focus" href={WHATSAPP_CONTACT_URL}>
            WhatsApp +226 51 51 31 97
          </a>
        </div>
      </footer>
    </>
  );
}
