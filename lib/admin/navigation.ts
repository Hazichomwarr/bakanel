export type AdminNavigationItem = {
  href: string;
  label: string;
};

export const primaryAdminNavigation: AdminNavigationItem[] = [
  { href: "/admin", label: "Tableau de bord" },
  { href: "/admin/formations", label: "Formations" },
  { href: "/admin/sessions", label: "Sessions" },
  { href: "/admin/experts", label: "Experts" },
  { href: "/admin/clients", label: "Clients" },
  { href: "/admin/actualites", label: "Actualités" },
];

export const secondaryAdminNavigation: AdminNavigationItem[] = [
  { href: "/admin/compte", label: "Mon compte" },
];

/** Matches a section boundary, so /admin/formations never activates /admin/formations-archive. */
export function isAdminNavigationActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/** `page` on the section's own route, `true` on a nested route inside it, otherwise absent. */
export function adminNavigationCurrent(pathname: string, href: string): "page" | "true" | undefined {
  if (pathname === href) return "page";
  return isAdminNavigationActive(pathname, href) ? "true" : undefined;
}
