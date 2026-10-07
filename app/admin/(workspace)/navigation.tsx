"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { logoutAction } from "../auth-actions";
import { adminNavigationCurrent, isAdminNavigationActive, primaryAdminNavigation, secondaryAdminNavigation, type AdminNavigationItem } from "@/lib/admin/navigation";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700";
const MOBILE_NAVIGATION_ID = "admin-mobile-navigation";

function NavigationItems({ items, pathname, onNavigate }: { items: AdminNavigationItem[]; pathname: string; onNavigate?: () => void }) {
  return items.map((item) => {
    const active = isAdminNavigationActive(pathname, item.href);
    return <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={adminNavigationCurrent(pathname, item.href)} className={`flex min-h-10 items-center rounded-lg px-3 py-2 text-sm font-medium ${focusRing} ${active ? "bg-emerald-700 text-white" : "text-zinc-700 hover:bg-zinc-100"}`}>{item.label}</Link>;
  });
}

function NavigationLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return <>
    <nav aria-label="Navigation principale" className="space-y-1">
      <NavigationItems items={primaryAdminNavigation} pathname={pathname} onNavigate={onNavigate} />
    </nav>
    <nav aria-label="Compte" className="mt-8 space-y-1 border-t border-zinc-200 pt-4">
      <NavigationItems items={secondaryAdminNavigation} pathname={pathname} onNavigate={onNavigate} />
      <form action={logoutAction}><button type="submit" className={`flex min-h-10 w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-100 ${focusRing}`}>Se déconnecter</button></form>
    </nav>
  </>;
}

/** Modal mobile navigation: focus moves in on open, Tab stays inside, Escape or the backdrop closes, focus returns to the Menu button. */
function MobileNavigation({ onClose }: { onClose: () => void }) {
  const panel = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab" || !panel.current) return;
      const focusable = [...panel.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")];
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return <div className="fixed inset-0 z-50 bg-zinc-950/35 md:hidden" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside ref={panel} id={MOBILE_NAVIGATION_ID} role="dialog" aria-modal="true" aria-label="Navigation" className="h-full w-72 max-w-[85vw] overflow-y-auto bg-white p-5 shadow-xl">
      <div className="mb-8 flex items-center justify-between"><Link href="/admin" onClick={onClose} className={`rounded text-lg font-bold text-emerald-800 ${focusRing}`}>W&apos;BAKENEL</Link><button ref={closeButton} type="button" onClick={onClose} className={`min-h-10 rounded-md border border-zinc-300 px-3 py-2 text-sm ${focusRing}`}>Fermer</button></div>
      <NavigationLinks onNavigate={onClose} />
    </aside>
  </div>;
}

export function AdminNavigation({ adminEmail, children }: { adminEmail: string; children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => { setIsOpen(false); menuButton.current?.focus(); }, []);

  return <div className="min-h-screen bg-zinc-50 text-zinc-900 md:flex">
    <aside className="hidden w-64 shrink-0 border-r border-zinc-200 bg-white p-5 md:block">
      <Link href="/admin" className={`mb-10 block rounded text-lg font-bold tracking-tight text-emerald-800 ${focusRing}`}>W&apos;BAKENEL <span className="block text-xs font-medium tracking-normal text-zinc-500">Administration</span></Link>
      <NavigationLinks />
    </aside>
    <div className="min-w-0 flex-1">
      <header className="flex min-h-16 items-center justify-between gap-4 border-b border-zinc-200 bg-white px-4 md:px-8">
        <button ref={menuButton} type="button" aria-expanded={isOpen} aria-controls={MOBILE_NAVIGATION_ID} onClick={() => setIsOpen(true)} className={`min-h-10 rounded-md border border-zinc-300 px-3 py-2 text-sm md:hidden ${focusRing}`}>Menu</button>
        <p className="hidden text-sm text-zinc-500 md:block">Espace de pilotage</p>
        <p className="min-w-0 truncate text-sm font-medium text-zinc-700" title={adminEmail}><span className="sr-only">Connecté en tant que </span>{adminEmail}</p>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
    {isOpen && <MobileNavigation onClose={close} />}
  </div>;
}
