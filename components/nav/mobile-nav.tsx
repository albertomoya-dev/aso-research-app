"use client";

import { Activity, Ellipsis, House, LayoutGrid, Plug } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { navHref, SETTINGS_ENTRY } from "@/lib/app-nav";
import { cn } from "@/lib/cn";
import type { ProductWithMarkets } from "@/lib/market-path";
import { useAppNav } from "./app-context";
import { AppSwitcherList } from "./app-switcher";
import { NavIconGlyph } from "./nav-icon";
import { SidebarLink } from "./sidebar-link";

const item = "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium";

/**
 * Bottom bar below 640 px: Inicio, Actividad, Apps (the app picker in a sheet) and Más (Integraciones,
 * the theme and, inside an app, its settings). It replaces the sidebar on phones.
 */
export function MobileNav({ products, unread }: { products: ProductWithMarkets[]; unread: number }) {
  const pathname = usePathname();
  const app = useAppNav();
  const [sheet, setSheet] = useState<"apps" | "more" | null>(null);
  const tone = (active: boolean) => (active ? "text-brand" : "text-ink-soft");
  const close = () => setSheet(null);

  return (
    <>
      <nav aria-label="Principal (móvil)" className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden">
        <Link href="/" aria-current={pathname === "/" ? "page" : undefined} className={cn(item, tone(pathname === "/"))}>
          <House size={20} strokeWidth={1.8} aria-hidden="true" />
          Inicio
        </Link>
        <Link href="/actividad" aria-current={pathname.startsWith("/actividad") ? "page" : undefined} className={cn(item, "relative", tone(pathname.startsWith("/actividad")))}>
          <Activity size={20} strokeWidth={1.8} aria-hidden="true" />
          Actividad
          {unread > 0 && (
            <span className="absolute top-1.5 left-1/2 ml-2 rounded-full bg-brand px-1.5 font-mono text-[10px] leading-4 font-semibold text-on-brand">
              <span className="sr-only">sin leer: </span>
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Link>
        <button type="button" onClick={() => setSheet("apps")} aria-haspopup="dialog" className={cn(item, tone(pathname.startsWith("/a/")))}>
          <LayoutGrid size={20} strokeWidth={1.8} aria-hidden="true" />
          Apps
        </button>
        <button type="button" onClick={() => setSheet("more")} aria-haspopup="dialog" className={cn(item, tone(pathname.startsWith("/integraciones")))}>
          <Ellipsis size={20} strokeWidth={1.8} aria-hidden="true" />
          Más
        </button>
      </nav>

      <Sheet open={sheet === "apps"} onOpenChange={(o) => setSheet(o ? "apps" : null)}>
        <SheetContent side="bottom" closeLabel="Cerrar" className="gap-2 p-0 pt-4">
          <SheetHeader className="px-4">
            <SheetTitle>Tus apps</SheetTitle>
            <SheetDescription className="sr-only">Elige una app y un país</SheetDescription>
          </SheetHeader>
          <AppSwitcherList products={products} current={app ? { slug: app.product.slug, country: app.market.country } : undefined} onSelect={close} />
        </SheetContent>
      </Sheet>

      <Sheet open={sheet === "more"} onOpenChange={(o) => setSheet(o ? "more" : null)}>
        <SheetContent side="bottom" closeLabel="Cerrar">
          <SheetHeader>
            <SheetTitle>Más</SheetTitle>
            <SheetDescription className="sr-only">Integraciones, tema y ajustes</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-0.5">
            {app && (
              <SidebarLink
                href={navHref(SETTINGS_ENTRY, { productSlug: app.product.slug, country: app.market.country })}
                active={pathname.startsWith(`/a/${app.product.slug}/ajustes`)}
                icon={<NavIconGlyph icon="settings" />}
                label={`Ajustes de ${app.product.title}`}
                onNavigate={close}
              />
            )}
            <SidebarLink
              href="/integraciones"
              active={pathname.startsWith("/integraciones")}
              icon={<Plug size={16} strokeWidth={1.8} aria-hidden="true" />}
              label="Integraciones"
              onNavigate={close}
            />
            <ThemeToggle />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
