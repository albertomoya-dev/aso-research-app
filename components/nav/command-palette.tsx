"use client";

import { Activity, Hash, House, Lightbulb, Plug, Plus, RefreshCw, Search, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, Suspense, use, useContext, useEffect, useState } from "react";
import { searchMarketKeywords, type KeywordHit } from "@/app/nav-actions";
import { AppIcon } from "@/components/app-icon";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { ALL_NAV_ENTRIES, flag, navHref } from "@/lib/app-nav";
import { getCountry } from "@/lib/countries";
import { marketPath, type ProductWithMarkets } from "@/lib/market-path";
import { useAppNav } from "./app-context";
import { useMarketActions } from "./market-actions";
import { NavIconGlyph } from "./nav-icon";

const PaletteContext = createContext<{ open: boolean; setOpen: (open: boolean) => void } | null>(null);

/** Holds the ⌘K palette's open state, so the header's search button can open it too. Ctrl+K / ⌘K toggle it. */
export function PaletteProvider({ products, children }: { products: Promise<ProductWithMarkets[]>; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <PaletteContext.Provider value={{ open, setOpen }}>
      {children}
      {/* The app list streams in; until then the palette is not mounted (it cannot be opened before hydration anyway). */}
      <Suspense>
        <PaletteWithProducts products={products} open={open} setOpen={setOpen} />
      </Suspense>
    </PaletteContext.Provider>
  );
}

/** «Buscar» button that opens the palette, with the shortcut shown from `md` up. */
export function PaletteButton({ className }: { className?: string }) {
  const ctx = useContext(PaletteContext);
  return (
    <Button variant="ghost" size="sm" className={className} onClick={() => ctx?.setOpen(true)} aria-keyshortcuts="Control+K Meta+K">
      <Search size={16} aria-hidden="true" />
      <span className="max-md:sr-only">Buscar</span>
      <kbd aria-hidden="true" className="hidden rounded border border-line px-1 font-mono text-[11px] text-muted lg:inline">
        Ctrl K
      </kbd>
    </Button>
  );
}

function PaletteWithProducts({ products, ...props }: { products: Promise<ProductWithMarkets[]>; open: boolean; setOpen: (open: boolean) => void }) {
  return <CommandPalette products={use(products)} {...props} />;
}

function CommandPalette({ products, open, setOpen }: { products: ProductWithMarkets[]; open: boolean; setOpen: (open: boolean) => void }) {
  const router = useRouter();
  const app = useAppNav();
  const actions = useMarketActions(app?.market.id ?? null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<{ query: string; items: KeywordHit[] }>({ query: "", items: [] });
  const marketId = app?.market.id;

  // Keywords of the active market: a small server search, debounced, only from 2 characters.
  useEffect(() => {
    if (!open || !marketId || query.trim().length < 2) return;
    const q = query.trim();
    const timer = setTimeout(() => {
      searchMarketKeywords(marketId, q)
        .then((items) => setHits({ query: q, items }))
        .catch(() => setHits({ query: q, items: [] }));
    }, 200);
    return () => clearTimeout(timer);
  }, [open, marketId, query]);

  const close = (next?: () => void) => {
    setOpen(false);
    setQuery("");
    next?.();
  };
  const go = (href: string) => close(() => router.push(href));
  const ref = app ? { productSlug: app.product.slug, country: app.market.country } : null;
  const keywordHits = ref && query.trim().length >= 2 && hits.query === query.trim() ? hits.items : [];

  return (
    <CommandDialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())} title="Buscar" description="Salta a una app, una sección o una keyword, o lanza una acción">
      <CommandInput placeholder={app ? `Buscar en ${app.product.title}…` : "Buscar una app o una acción…"} value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>Sin resultados.</CommandEmpty>
        {app && ref && (
          <>
            <CommandGroup heading="Acciones">
              <CommandItem value="Actualizar posiciones consultar tienda" onSelect={() => close(actions.refreshRankings)}>
                <RefreshCw aria-hidden="true" />
                Actualizar posiciones
                <CommandShortcut>{getCountry(app.market.country).name}</CommandShortcut>
              </CommandItem>
              <CommandItem value="Optimizar ficha editor" onSelect={() => go(marketPath(ref, "/ficha"))}>
                <Sparkles aria-hidden="true" />
                Optimizar ficha
              </CommandItem>
              <CommandItem value="Generar ideas keywords ia" onSelect={() => go(marketPath(ref, "/ideas"))}>
                <Lightbulb aria-hidden="true" />
                Generar ideas
              </CommandItem>
            </CommandGroup>
            {keywordHits.length > 0 && (
              <CommandGroup heading="Keywords">
                {keywordHits.map((k) => (
                  <CommandItem key={k.id} value={`keyword ${k.term} ${query}`} onSelect={() => go(marketPath(ref, `/keywords/${k.id}`))}>
                    <Hash aria-hidden="true" />
                    {k.term}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandGroup heading={app.product.title}>
              {ALL_NAV_ENTRIES.map((entry) => (
                <CommandItem key={entry.id} value={`sección ${entry.label}`} onSelect={() => go(navHref(entry, ref))}>
                  <NavIconGlyph icon={entry.icon} />
                  {entry.label}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}
        {products.length > 0 && (
          <CommandGroup heading="Apps y mercados">
            {products.flatMap((p) =>
              p.markets.map((m) => (
                <CommandItem
                  key={m.id}
                  value={`app ${p.title} ${getCountry(m.country).name} ${m.country}`}
                  onSelect={() => go(marketPath({ productSlug: p.slug, country: m.country }))}
                >
                  <AppIcon src={p.icon} size={20} />
                  <span className="min-w-0 flex-1 truncate">
                    {p.title} <span className="text-muted">· {getCountry(m.country).name}</span>
                  </span>
                  <span aria-hidden="true" className="text-label">
                    {flag(m.country)}
                  </span>
                </CommandItem>
              )),
            )}
          </CommandGroup>
        )}
        <CommandGroup heading="Ir a">
          <CommandItem value="Inicio todas las apps" onSelect={() => go("/")}>
            <House aria-hidden="true" />
            Inicio
          </CommandItem>
          <CommandItem value="Actividad novedades avisos resumen semanal" onSelect={() => go("/actividad")}>
            <Activity aria-hidden="true" />
            Actividad
          </CommandItem>
          <CommandItem value="Integraciones ajustes claves" onSelect={() => go("/integraciones")}>
            <Plug aria-hidden="true" />
            Integraciones
          </CommandItem>
          <CommandItem value="Añadir app buscar seguir nueva" onSelect={() => go("/apps/nueva")}>
            <Plus aria-hidden="true" />
            Añadir app
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
