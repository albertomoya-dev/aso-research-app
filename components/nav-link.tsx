"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-11 shrink-0 items-center gap-2.5 rounded-md px-2.5 text-[13px] whitespace-nowrap md:min-h-8 ${
        active ? "bg-surface-muted font-medium text-ink light:bg-line" : "text-ink-soft hover:bg-surface-muted hover:text-ink light:hover:bg-line/60"
      }`}
    >
      {children}
    </Link>
  );
}
