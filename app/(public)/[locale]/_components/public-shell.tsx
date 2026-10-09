"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { WHATSAPP_CONTACT_URL } from "@/lib/public/contact";
import type { PublicDictionary } from "@/lib/public/content";
import type { PublicLocale } from "@/lib/public/locale";
import { localizedPathname, publicHref, publicLocales } from "@/lib/public/locale";
import { servicesHref } from "@/lib/public/services";
function servicesAriaCurrent(pathname: string, servicesPath: string, inServices: boolean) {
  if (pathname === servicesPath) {
    return "page";
  }

  if (inServices) {
    return "true";
  }

  return undefined;
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
  const pathname = usePathname() ?? publicHref(locale);
  const servicesPath = servicesHref(locale);
  const inServices = pathname === servicesPath || pathname.startsWith(`${servicesPath}/`);
  const servicesCurrent = servicesAriaCurrent(pathname, servicesPath, inServices);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
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
  return (
    <>
      <a href="#public-content" className="sr-only focus:not-sr-only">
        {dictionary.skipToContent}
      </a>
      <header className="border-b border-[var(--wb-rule)] bg-[var(--wb-paper)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <Link href={publicHref(locale)} className="wb-mono text-lg font-semibold">
            W&apos;BAKENEL
          </Link>
          <nav className="hidden items-center gap-4 md:flex" aria-label={dictionary.navigation}>
            <Link
              href={servicesPath}
              aria-current={servicesCurrent}
              className={`wb-focus mr-2 text-sm font-medium ${inServices ? "underline underline-offset-4" : ""}`}
            >
              {dictionary.servicesNav}
            </Link>
            {publicLocales.map((item) => (
              <Link
                key={item}
                href={localizedPathname(pathname, item)}
                hrefLang={item}
                lang={item}
                aria-current={item === locale ? "page" : undefined}
                className="wb-focus text-sm"
              >
                {item.toUpperCase()}
              </Link>
            ))}
            <a
              href={WHATSAPP_CONTACT_URL}
              className="wb-focus border border-[var(--wb-green-deep)] px-3 py-2 text-sm"
            >
              {dictionary.contact}
            </a>
          </nav>
          <button
            ref={trigger}
            className="wb-focus min-h-10 px-2 text-sm md:hidden"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            {dictionary.menu}
          </button>
        </div>
      </header>
      {open ? (
        <div className="fixed inset-0 z-50 bg-black/30">
          <aside
            ref={panel}
            role="dialog"
            aria-modal="true"
            className="ml-auto h-full w-72 bg-[var(--wb-paper)] p-6"
          >
            <button
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              {dictionary.closeMenu}
            </button>
            <nav className="mt-8 flex flex-col gap-5" aria-label={dictionary.navigation}>
              <Link
                href={servicesPath}
                aria-current={servicesCurrent}
                className="wb-focus min-h-10 text-lg font-medium"
                onClick={() => setOpen(false)}
              >
                {dictionary.servicesNav}
              </Link>
              {publicLocales.map((item) => (
                <Link
                  key={item}
                  href={localizedPathname(pathname, item)}
                  hrefLang={item}
                  lang={item}
                  aria-current={item === locale ? "page" : undefined}
                  className="wb-focus"
                  onClick={() => setOpen(false)}
                >
                  {item.toUpperCase()}
                </Link>
              ))}
              <a className="wb-focus" href={WHATSAPP_CONTACT_URL}>
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
