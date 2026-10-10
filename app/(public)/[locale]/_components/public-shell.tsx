"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { WHATSAPP_CONTACT_URL } from "@/lib/public/contact";
import type { PublicDictionary } from "@/lib/public/content";
import type { PublicLocale } from "@/lib/public/locale";
import { localizedPublicHref, publicHref, publicLocales } from "@/lib/public/locale";
import { servicesHref } from "@/lib/public/services";

type NavigationItem = {
  href: string;
  label: string;
  current?: "page" | "true";
};

function servicesAriaCurrent(pathname: string, servicesPath: string, inServices: boolean) {
  if (pathname === servicesPath) {
    return "page";
  }

  if (inServices) {
    return "true";
  }

  return undefined;
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
      languageHref={(target) => localizedPublicHref(pathname, target, search, hash)}
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
      languageHref={(target) => localizedPublicHref(pathname, target, "", hash)}
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
  const [hash, setHash] = useState("");
  const pathname = usePathname() ?? publicHref(locale);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const servicesPath = servicesHref(locale);
  const inServices = pathname === servicesPath || pathname.startsWith(`${servicesPath}/`);
  const servicesCurrent = servicesAriaCurrent(pathname, servicesPath, inServices);
  const homePath = publicHref(locale);

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

  const navigationItems: NavigationItem[] = [
    {
      href: homePath,
      label: dictionary.homeNav,
      current: pathname === homePath ? "page" : undefined,
    },
    { href: `${homePath}#formations-publiees`, label: dictionary.trainingsNav },
    { href: `${homePath}#a-propos`, label: dictionary.aboutNav },
    { href: servicesPath, label: dictionary.servicesNav, current: servicesCurrent },
  ];

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
