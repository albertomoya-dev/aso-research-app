"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// `scope`: "market" pages hang from `/a/[app]/[market]`, "product" ones from `/a/[app]` (same in every country).
const TABS = [
  { scope: "market", path: "/keywords", label: "Keywords" },
  { scope: "market", path: "/descubrir", label: "Descubrir" },
  { scope: "market", path: "/ideas", label: "Ideas con IA" },
  { scope: "market", path: "/top10", label: "Keywords del TOP 10" },
  { scope: "market", path: "/resenas", label: "Reseñas" },
  { scope: "market", path: "/competidores", label: "Competidores" },
  { scope: "market", path: "/tendencias", label: "Estacionalidad" },
  { scope: "market", path: "/cambios", label: "Cambios" },
  { scope: "product", path: "/ajustes/producto", label: "Producto" },
  { scope: "market", path: "/ficha", label: "Editor de ficha" },
  { scope: "product", path: "/creativos", label: "Creativos" },
] as const;

/** `marketBase` is `/a/[app]/[market]` (on the app-wide pages, the primary market's); `productBase` is `/a/[app]`. */
export function AppTabs({ marketBase, productBase }: { marketBase: string; productBase: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Secciones de la app" className="-mx-1 overflow-x-auto border-b border-line">
      <ul className="flex min-w-max gap-1 px-1">
        {TABS.map((tab) => {
          const href = (tab.scope === "market" ? marketBase : productBase) + tab.path;
          // The market root shows the keywords too; keyword detail pages belong to the Keywords tab.
          const active = pathname.startsWith(href) || (tab.path === "/keywords" && pathname === marketBase);
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
