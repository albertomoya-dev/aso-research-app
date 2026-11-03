"use client";

import { Check, ChevronDown, Ellipsis, ExternalLink, Menu, RefreshCw, ScanText, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, use, useState } from "react";
import { AppIcon } from "@/components/app-icon";
import { StoreBadge } from "@/components/store-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { activeNavId, ALL_NAV_ENTRIES, flag, navHref, SETTINGS_ENTRY, switchMarketPath } from "@/lib/app-nav";
import { getCountry } from "@/lib/countries";
import { formatDay } from "@/lib/format";
import { STORE_LABEL } from "@/lib/stores/types";
import { useAppNav } from "./app-context";
import { AppNavLinks, AppSettingsLink } from "./app-nav-links";
import { PaletteButton } from "./command-palette";
import { useMarketActions } from "./market-actions";

/** «Posiciones del 3 nov», from the layout's aggregated query. */
function LastCheck() {
  const app = useAppNav()!;
  const day = use(app.counters)[app.market.id]?.lastCheck;
  return <span className="text-table whitespace-nowrap text-muted">{day ? `Posiciones del ${formatDay(day)}` : "Sin posiciones aún"}</span>;
}

function MarketMenu() {
  const app = useAppNav()!;
  const pathname = usePathname();
  const current = getCountry(app.market.country);
  // In a market, the same sub-page of the other one; on an app-wide page, the same page with ?m=.
  const hrefFor = (country: string) => (app.inMarket ? switchMarketPath(pathname, country) : `${pathname}?m=${country}`);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="min-w-0 gap-1 px-2">
          <span aria-hidden="true">{flag(app.market.country)}</span>
          <span className="sr-only">Mercado: </span>
          <span className="truncate max-sm:sr-only">{current.name}</span>
          <span className="font-mono text-label text-muted max-md:hidden">{current.locale}</span>
          <ChevronDown size={14} aria-hidden="true" className="text-muted" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-60">
        <DropdownMenuLabel>Mercados de {app.product.title}</DropdownMenuLabel>
        {app.markets.map((m) => {
          const c = getCountry(m.country);
          const selected = m.id === app.market.id;
          return (
            <DropdownMenuItem key={m.id} asChild>
              <Link href={hrefFor(m.country)} aria-current={selected ? "true" : undefined}>
                <span aria-hidden="true">{flag(m.country)}</span>
                <span className="flex-1">{c.name}</span>
                <span className="font-mono text-label text-muted">{c.locale}</span>
                {selected ? <Check aria-hidden="true" /> : <span className="size-4" />}
              </Link>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={navHref({ ...SETTINGS_ENTRY, path: "/ajustes/mercados" }, { productSlug: app.product.slug, country: app.market.country })}>
            <Settings aria-hidden="true" />
            Añadir o quitar mercados
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Below 640 px the sidebar is gone: the current section opens the app's sections in a sheet. */
function MobileSections() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const app = useAppNav()!;
  const active = ALL_NAV_ENTRIES.find((e) => e.id === activeNavId(pathname));
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button variant="secondary" size="sm" className="w-full justify-between sm:hidden" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span className="flex items-center gap-2">
          <Menu size={16} aria-hidden="true" />
          {active?.label ?? "Secciones"}
        </span>
        <ChevronDown size={14} aria-hidden="true" className="text-muted" />
      </Button>
      <SheetContent side="bottom" closeLabel="Cerrar">
        <SheetHeader>
          <SheetTitle>{app.product.title}</SheetTitle>
          <SheetDescription>Secciones de {getCountry(app.market.country).name}</SheetDescription>
        </SheetHeader>
        <nav aria-label="Secciones de la app (móvil)" className="flex flex-col gap-3">
          <AppNavLinks onNavigate={() => setOpen(false)} />
          <div className="border-t border-line pt-3">
            <AppSettingsLink onNavigate={() => setOpen(false)} />
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  );
}

/**
 * The fixed 56 px header inside an app: icon and name, store, market picker, «Posiciones del…», the
 * primary action «Actualizar posiciones» and the «⋯» menu (Actualizar ficha, Ver en la tienda, Ajustes).
 */
export function AppHeader() {
  const app = useAppNav()!;
  const actions = useMarketActions(app.market.id);
  const ref = { productSlug: app.product.slug, country: app.market.country };
  return (
    <header className="shrink-0 border-b border-line bg-surface">
      <div className="flex h-14 items-center gap-2 px-4 md:gap-3 md:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-3">
          <AppIcon src={app.product.icon} size={28} />
          <span className="min-w-0 truncate text-card-title font-semibold">{app.product.title}</span>
          <span className="whitespace-nowrap max-lg:hidden">
            <StoreBadge store={app.product.store} />
          </span>
          <MarketMenu />
        </div>
        <div className="flex shrink-0 items-center gap-1 md:gap-2">
          <span className="max-lg:hidden">
            <Suspense fallback={null}>
              <LastCheck />
            </Suspense>
          </span>
          <PaletteButton />
          <Button
            variant="primary"
            onClick={actions.refreshRankings}
            disabled={actions.refreshing}
            aria-busy={actions.refreshing}
            aria-label={actions.refreshing ? "Consultando la tienda…" : "Actualizar posiciones"}
          >
            <RefreshCw size={16} aria-hidden="true" className={actions.refreshing ? "animate-spin motion-reduce:animate-none" : undefined} />
            <span className="max-md:sr-only">{actions.refreshing ? "Consultando…" : "Actualizar posiciones"}</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Más acciones">
                <Ellipsis size={16} aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={actions.refreshListing} disabled={actions.reading}>
                <ScanText aria-hidden="true" />
                {actions.reading ? "Leyendo la ficha…" : "Actualizar ficha"}
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={app.market.url} target="_blank" rel="noreferrer">
                  <ExternalLink aria-hidden="true" />
                  Ver en {STORE_LABEL[app.product.store]}
                </a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href={navHref(SETTINGS_ENTRY, ref)}>
                  <Settings aria-hidden="true" />
                  Ajustes de la app
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="px-4 pb-2 sm:hidden">
        <MobileSections />
      </div>
    </header>
  );
}
