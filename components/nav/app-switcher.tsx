"use client";

import { ChevronsUpDown, LayoutGrid, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppIcon } from "@/components/app-icon";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { flag } from "@/lib/app-nav";
import { cn } from "@/lib/cn";
import { getCountry } from "@/lib/countries";
import { marketPath, type ProductWithMarkets } from "@/lib/market-path";

/** The searchable list of apps, grouped by app with one entry per market, plus «Añadir app». */
export function AppSwitcherList({
  products,
  current,
  onSelect,
  autoFocus,
}: {
  products: ProductWithMarkets[];
  current?: { slug: string; country: string | null };
  onSelect?: () => void;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const go = (href: string) => {
    onSelect?.();
    router.push(href);
  };
  return (
    <Command label="Elegir app" className="rounded-none">
      <CommandInput placeholder="Buscar app o país…" autoFocus={autoFocus} />
      <CommandList>
        <CommandEmpty>Ninguna app coincide.</CommandEmpty>
        {products.map((p) => (
          <CommandGroup key={p.id} heading={p.title}>
            {p.markets.map((m) => {
              const name = getCountry(m.country).name;
              const selected = current?.slug === p.slug && current.country === m.country;
              return (
                <CommandItem
                  key={m.id}
                  value={`${p.title} ${name} ${m.country} ${p.slug}`}
                  onSelect={() => go(marketPath({ productSlug: p.slug, country: m.country }))}
                  aria-current={selected ? "true" : undefined}
                >
                  <AppIcon src={p.icon} size={20} />
                  <span className="min-w-0 flex-1 truncate">
                    {p.title} <span className="text-muted">· {name}</span>
                  </span>
                  <span aria-hidden="true" className="text-label text-muted">
                    {flag(m.country)}
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
        {products.length > 0 && <CommandSeparator />}
        <CommandGroup>
          <CommandItem value="Inicio todas las apps" onSelect={() => go("/")}>
            <LayoutGrid aria-hidden="true" />
            Todas las apps
          </CommandItem>
          <CommandItem value="Añadir app nueva seguir" onSelect={() => go("/apps/nueva")}>
            <Plus aria-hidden="true" />
            Añadir app
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

/**
 * The app picker at the top of the sidebar: a button with the current app (or «Tus apps») that opens
 * the list in a popover. On tablets only the icon shows.
 */
export function AppSwitcher({
  products,
  current,
  currentProduct,
}: {
  products: ProductWithMarkets[];
  current?: { slug: string; country: string | null };
  /** Title and icon of the current app while the list streams in. */
  currentProduct?: { title: string; icon: string };
}) {
  const [open, setOpen] = useState(false);
  const product = (current ? products.find((p) => p.slug === current.slug) : undefined) ?? currentProduct;
  const label = product ? product.title : "Tus apps";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={`${label}: cambiar de app`}
        title={label}
        className={cn(
          "flex min-h-11 w-full items-center gap-2 rounded-control border border-line px-2 text-left text-table text-ink hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-brand md:min-h-9",
          "sm:max-lg:justify-center sm:max-lg:border-transparent sm:max-lg:px-0",
        )}
      >
        {product ? (
          <AppIcon src={product.icon} size={20} />
        ) : (
          <LayoutGrid size={16} strokeWidth={1.8} aria-hidden="true" className="shrink-0 text-muted" />
        )}
        <span className="min-w-0 flex-1 truncate font-medium sm:max-lg:sr-only">{label}</span>
        <ChevronsUpDown size={14} aria-hidden="true" className="shrink-0 text-muted sm:max-lg:hidden" />
      </PopoverTrigger>
      <PopoverContent className="w-80 overflow-hidden p-0" align="start">
        <AppSwitcherList products={products} current={current} onSelect={() => setOpen(false)} autoFocus />
      </PopoverContent>
    </Popover>
  );
}
