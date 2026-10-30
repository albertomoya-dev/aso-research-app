"use client";

import { useRouter } from "next/navigation";
import { COUNTRIES } from "@/lib/countries";
import type { DraftTarget, LocaleOption } from "@/lib/listing-drafts";
import type { Store } from "@/lib/stores/types";
import { Card, inputClass } from "./ui";

type Props = {
  appId: number;
  store: Store;
  /** The app's main locale: its URL has no query. */
  mainLocale: string;
  options: LocaleOption[];
  current: DraftTarget;
};

const GROUPS: { kind: LocaleOption["kind"]; label: string }[] = [
  { kind: "main", label: "Ficha principal" },
  { kind: "extra", label: "Otros idiomas que indexa el App Store en este país" },
  { kind: "current", label: "Abierta ahora" },
  { kind: "draft", label: "Con borrador guardado" },
  { kind: "other", label: "Otros idiomas" },
];

/** Which listing the editor works on: a language, and in Google Play optionally a custom listing for one country. */
export function LocalePicker({ appId, store, mainLocale, options, current }: Props) {
  const router = useRouter();
  const go = (target: DraftTarget) => {
    const q = new URLSearchParams();
    if (target.locale !== mainLocale || target.country) q.set("locale", target.locale);
    if (target.country) q.set("country", target.country);
    const query = q.toString();
    router.push(`/apps/${appId}/metadata${query ? `?${query}` : ""}`);
  };
  const value = `${current.locale}|${current.country}`;

  return (
    <Card aria-label="Idioma de la ficha" className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-end md:gap-5">
      <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
        Idioma de la ficha
        <select
          value={value}
          onChange={(e) => {
            const [locale, country] = e.target.value.split("|");
            go({ locale, country: country ?? "" });
          }}
          className={inputClass}
        >
          {GROUPS.map((g) => {
            const items = options.filter((o) => o.kind === g.kind);
            if (items.length === 0) return null;
            return (
              <optgroup key={g.kind} label={g.label}>
                {items.map((o) => (
                  <option key={`${o.locale}|${o.country}`} value={`${o.locale}|${o.country}`}>
                    {o.label} ({o.locale}){o.hasDraft && g.kind !== "draft" ? " · borrador" : ""}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </label>
      {store === "android" && (
        <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
          Ficha personalizada por país
          <select value={current.country} onChange={(e) => go({ locale: current.locale, country: e.target.value })} className={inputClass}>
            <option value="">Ninguna: ficha principal del idioma</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="text-xs text-muted md:max-w-[280px]">
        {store === "android"
          ? "Google Play permite fichas personalizadas para un país concreto (por ejemplo, México con sus propias palabras)."
          : "En el App Store, cada país muestra e indexa también otros idiomas: una ficha en ellos suma keywords allí."}
      </p>
    </Card>
  );
}
