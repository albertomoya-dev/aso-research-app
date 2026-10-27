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
      className={`flex min-h-11 items-center gap-2.5 rounded-md px-3 text-sm ${
        active ? "bg-surface-muted font-medium text-ink" : "text-ink-soft hover:bg-surface-muted"
      }`}
    >
      {children}
    </Link>
  );
}
