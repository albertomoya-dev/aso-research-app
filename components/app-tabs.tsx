"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { path: "", label: "Keywords" },
  { path: "/descubrir", label: "Descubrir" },
  { path: "/ideas", label: "Ideas con IA" },
  { path: "/top10", label: "Keywords del TOP 10" },
  { path: "/resenas", label: "Reseñas" },
  { path: "/competidores", label: "Competidores" },
  { path: "/estacionalidad", label: "Estacionalidad" },
  { path: "/metadata", label: "Editor de ficha" },
  { path: "/creativos", label: "Creativos" },
];

export function AppTabs({ appId }: { appId: string }) {
  const pathname = usePathname();
  const base = `/apps/${appId}`;
  return (
    <nav aria-label="Secciones de la app" className="-mx-1 overflow-x-auto border-b border-line">
      <ul className="flex min-w-max gap-1 px-1">
        {TABS.map((tab) => {
          const href = base + tab.path;
          // Keyword detail pages belong to the Keywords tab.
          const active = tab.path ? pathname.startsWith(href) : pathname === base || pathname.startsWith(`${base}/keywords`);
          return (
            <li key={tab.path}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-11 items-center border-b-2 px-3 text-[13px] font-medium md:min-h-10 ${
                  active ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
