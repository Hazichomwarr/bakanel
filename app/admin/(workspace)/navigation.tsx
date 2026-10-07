"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { logoutAction } from "../auth-actions";
import { adminNavigationCurrent, isAdminNavigationActive, primaryAdminNavigation, secondaryAdminNavigation, type AdminNavigationItem } from "@/lib/admin/navigation";

const focusRing = "wb-focus";
const MOBILE_NAVIGATION_ID = "admin-mobile-navigation";

function NavigationItems({ items, pathname, onNavigate }: { items: AdminNavigationItem[]; pathname: string; onNavigate?: () => void }) {
  return items.map((item) => {
    const active = isAdminNavigationActive(pathname, item.href);
    return <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={adminNavigationCurrent(pathname, item.href)} className={`flex min-h-11 items-center border-l-2 px-4 py-2 text-sm transition-colors ${focusRing} ${active ? "border-[#b8d39b] bg-white/10 font-semibold text-white" : "border-transparent text-stone-300 hover:border-white/45 hover:bg-white/5 hover:text-white"}`}>{item.label}</Link>;
  });
}

function NavigationLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return <>
    <nav aria-label="Navigation principale" className="space-y-1">
      <NavigationItems items={primaryAdminNavigation} pathname={pathname} onNavigate={onNavigate} />
    </nav>
    <nav aria-label="Compte" className="mt-10 space-y-1 border-t border-white/20 pt-5">
      <NavigationItems items={secondaryAdminNavigation} pathname={pathname} onNavigate={onNavigate} />
      <form action={logoutAction}><button type="submit" className={`flex min-h-11 w-full items-center border-l-2 border-transparent px-4 py-2 text-left text-sm text-stone-300 transition-colors hover:border-white/45 hover:bg-white/5 hover:text-white ${focusRing}`}>Se déconnecter</button></form>
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

  return <div className="fixed inset-0 z-50 bg-[#18211d]/50 md:hidden" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside ref={panel} id={MOBILE_NAVIGATION_ID} role="dialog" aria-modal="true" aria-label="Navigation" className="h-full w-80 max-w-[88vw] overflow-y-auto bg-[#15382f] p-6 shadow-2xl">
      <div className="mb-12 flex items-start justify-between gap-4"><Link href="/admin" onClick={onClose} className={`wb-mono rounded text-base leading-6 tracking-tight text-white ${focusRing}`}>W&apos;BAKENEL<span className="mt-1 block text-[10px] tracking-[0.16em] text-[#b8d39b]">CONSULTING INSTITUTE</span></Link><button ref={closeButton} type="button" onClick={onClose} className={`min-h-10 border border-white/35 px-3 py-2 text-sm text-white ${focusRing}`}>Fermer</button></div>
      <NavigationLinks onNavigate={onClose} />
    </aside>
  </div>;
}

export function AdminNavigation({ adminEmail, children }: { adminEmail: string; children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => { setIsOpen(false); menuButton.current?.focus(); }, []);

  return <div className="wb-workspace min-h-screen md:flex">
    <aside className="hidden w-72 shrink-0 flex-col bg-[#15382f] px-6 py-8 text-white md:flex">
      <Link href="/admin" className={`wb-mono mb-16 block rounded text-xl leading-7 tracking-tight ${focusRing}`}>W&apos;BAKENEL <span className="mt-1 block text-[10px] font-medium tracking-[0.18em] text-[#b8d39b]">CONSULTING INSTITUTE</span></Link>
      <NavigationLinks />
    </aside>
    <div className="min-w-0 flex-1">
      <header className="flex min-h-20 items-center justify-between gap-4 border-b border-[#c8cac0] px-4 md:px-10">
        <button ref={menuButton} type="button" aria-expanded={isOpen} aria-controls={MOBILE_NAVIGATION_ID} onClick={() => setIsOpen(true)} className={`min-h-11 border border-[#626862] px-3 py-2 text-sm md:hidden ${focusRing}`}>Menu</button>
        <div className="hidden md:block"><p className="wb-mono text-[11px] tracking-[0.15em] text-[#245b49]">W&apos;BAKENEL</p><p className="mt-1 text-sm text-[#626862]">Espace de pilotage</p></div>
        <p className="min-w-0 truncate text-sm text-[#18211d]" title={adminEmail}><span className="sr-only">Connecté en tant que </span>{adminEmail}</p>
      </header>
      <main className="mx-auto w-full max-w-[82rem] px-5 py-8 md:px-10 md:py-12">{children}</main>
    </div>
    {isOpen && <MobileNavigation onClose={close} />}
  </div>;
}
