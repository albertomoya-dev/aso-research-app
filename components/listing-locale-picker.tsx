"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { COUNTRIES } from "@/lib/countries";
import type { DraftTarget, LocaleOption } from "@/lib/listing-drafts";
import type { Store } from "@/lib/stores/types";
import { inputClass } from "./ui";
import { Button } from "./ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

/** URL of the editor for a listing: the main locale has no query (same rule as the page's `resolveTarget`). */
export function editorUrl(editorHref: string, mainLocale: string, target: DraftTarget, extra?: Record<string, string>): string {
  const q = new URLSearchParams();
  if (target.locale !== mainLocale || target.country) q.set("locale", target.locale);
  if (target.country) q.set("country", target.country);
  for (const [k, v] of Object.entries(extra ?? {})) q.set(k, v);
  const query = q.toString();
  return `${editorHref}${query ? `?${query}` : ""}`;
}

type Props = {
  editorHref: string;
  store: Store;
  mainLocale: string;
  options: LocaleOption[];
  current: DraftTarget;
  /** Controlled from «Adaptar a… › Otro idioma». */
  addOpen: boolean;
  onAddOpenChange: (open: boolean) => void;
};

const key = (t: DraftTarget) => `${t.locale}|${t.country}`;

/**
 * The listing's language in the top bar: only the market's locales and those with a saved draft; any
 * other language (and, in Google Play, a custom listing for one country) comes from «+ Añadir idioma».
 */
export function ListingLocalePicker({ editorHref, store, mainLocale, options, current, addOpen, onAddOpenChange }: Props) {
  const router = useRouter();
  const go = (target: DraftTarget) => router.push(editorUrl(editorHref, mainLocale, target));
  const shown = options.filter((o) => o.kind !== "other");
  const others = options.filter((o) => o.kind === "other");
  const [country, setCountry] = useState("");

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <label htmlFor="listing-locale" className="sr-only">
        Idioma de la ficha
      </label>
      <select
        id="listing-locale"
        value={key(current)}
        onChange={(e) => {
          const [locale, c] = e.target.value.split("|");
          go({ locale, country: c ?? "" });
        }}
        className={`${inputClass} max-w-full min-w-0`}
      >
        {shown.map((o) => (
          <option key={key(o)} value={key(o)}>
            {o.label} ({o.locale}){o.kind === "main" ? " · principal" : o.hasDraft ? " · borrador" : ""}
          </option>
        ))}
      </select>
      <Popover open={addOpen} onOpenChange={onAddOpenChange}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="md">
            <Plus size={16} aria-hidden="true" />
            Añadir idioma
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" aria-label="Añadir idioma">
          <Command>
            <CommandInput placeholder="Buscar idioma…" aria-label="Buscar idioma" />
            <CommandList>
              <CommandEmpty>Sin resultados</CommandEmpty>
              <CommandGroup heading="Otros idiomas">
                {others.map((o) => (
                  <CommandItem
                    key={key(o)}
                    value={`${o.label} ${o.locale}`}
                    onSelect={() => {
                      onAddOpenChange(false);
                      go(o);
                    }}
                  >
                    {o.label} <span className="text-label text-muted">{o.locale}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
          {store === "android" && (
            // Not a <form>: the picker lives inside the editor's form (React events cross the portal).
            <div className="flex flex-col gap-2 border-t border-line p-3">
              <label htmlFor="listing-country" className="text-label font-medium text-ink-soft">
                Ficha personalizada por país ({current.locale})
              </label>
              <div className="flex gap-2">
                <select id="listing-country" value={country} onChange={(e) => setCountry(e.target.value)} className={`${inputClass} min-w-0 flex-1`}>
                  <option value="">Ninguna: ficha principal del idioma</option>
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <Button
                  size="md"
                  onClick={() => {
                    onAddOpenChange(false);
                    go({ locale: current.locale, country });
                  }}
                >
                  Abrir
                </Button>
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
