"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  { path: "", label: "Screenshots" },
  { path: "/icono", label: "Icono" },
  { path: "/logo", label: "Logo con IA" },
];

/** Segmented control between the creative tools of an app. */
export function CreativeNav({ appId }: { appId: number }) {
  const pathname = usePathname();
  const base = `/apps/${appId}/creativos`;
  return (
    <nav aria-label="Creativos" className="inline-flex rounded-md border border-line-strong bg-surface-muted p-0.5">
      {SECTIONS.map((s) => {
        const href = base + s.path;
        const active = pathname === href;
        return (
          <Link
            key={s.path}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-9 items-center rounded px-3 text-[13px] font-medium md:min-h-7 ${
              active ? "bg-surface text-ink shadow-[inset_0_1px_0_0_var(--edge)]" : "text-muted hover:text-ink"
            }`}
          >
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
