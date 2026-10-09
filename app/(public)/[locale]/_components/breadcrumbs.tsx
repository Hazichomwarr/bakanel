import Link from "next/link";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

/**
 * The last item is the current page and is rendered without a link.
 */
export function Breadcrumbs({
  label,
  items,
  tone = "light",
}: {
  label: string;
  items: BreadcrumbItem[];
  tone?: "light" | "dark";
}) {
  const linkColor = tone === "dark" ? "text-[#c9d8c8]" : "text-[var(--wb-green)]";
  const currentColor = tone === "dark" ? "text-white" : "text-[var(--wb-ink)]";

  return (
    <nav aria-label={label}>
      <ol className="wb-mono flex flex-wrap items-center gap-x-2 gap-y-1 text-xs tracking-[0.08em]">
        {items.map((item, index) => {
          const isCurrent = index === items.length - 1;

          return (
            <li key={item.label} className="flex items-center gap-2">
              {item.href && !isCurrent ? (
                <Link
                  className={`wb-focus underline-offset-4 hover:underline ${linkColor}`}
                  href={item.href}
                >
                  {item.label}
                </Link>
              ) : (
                <span aria-current={isCurrent ? "page" : undefined} className={currentColor}>
                  {item.label}
                </span>
              )}
              {isCurrent ? null : (
                <span aria-hidden="true" className={linkColor}>
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
