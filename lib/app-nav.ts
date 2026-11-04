// Navigation of an app (pure: no database, usable from client components and tests).
//
// The app sidebar, the mobile section sheet and the ⌘K palette all read NAV_GROUPS. `market` entries
// hang from `/a/[app]/[market]`, `product` ones from `/a/[app]` (the same in every country).

import { marketPath, productPath } from "./market-path";

export type NavScope = "market" | "product";
export type NavIcon =
  | "summary"
  | "tracking"
  | "find"
  | "competitors"
  | "reviews"
  | "trends"
  | "listing"
  | "creatives"
  | "changes"
  | "settings";
/** Which counter of `MarketCounters` an entry shows. */
export type NavCounter = "alerts" | "ideas" | "pending";

export type NavEntry = {
  id: string;
  label: string;
  scope: NavScope;
  /** Path under the market or product base, "" for the market root. */
  path: string;
  icon: NavIcon;
  /** Other first segments that belong to this entry. */
  also?: string[];
  counter?: NavCounter;
};

export type NavGroup = { id: string; label: string | null; entries: NavEntry[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "top",
    label: null,
    // The market root is the Resumen (phase 28); the keyword table is Seguimiento.
    entries: [{ id: "resumen", label: "Resumen", scope: "market", path: "", icon: "summary", counter: "alerts" }],
  },
  {
    id: "keywords",
    label: "Keywords",
    entries: [
      { id: "seguimiento", label: "Seguimiento", scope: "market", path: "/keywords", icon: "tracking" },
      { id: "encontrar", label: "Encontrar", scope: "market", path: "/encontrar", icon: "find", counter: "pending" },
    ],
  },
  {
    id: "mercado",
    label: "Mercado",
    entries: [
      { id: "competidores", label: "Competidores", scope: "market", path: "/competidores", icon: "competitors" },
      { id: "resenas", label: "Reseñas", scope: "market", path: "/resenas", icon: "reviews" },
      { id: "tendencias", label: "Tendencias", scope: "market", path: "/tendencias", icon: "trends" },
    ],
  },
  {
    id: "optimizar",
    label: "Optimizar",
    entries: [
      { id: "ficha", label: "Ficha de la tienda", scope: "market", path: "/ficha", icon: "listing" },
      { id: "creativos", label: "Creativos", scope: "product", path: "/creativos", icon: "creatives" },
      { id: "cambios", label: "Cambios y pruebas", scope: "market", path: "/cambios", icon: "changes" },
    ],
  },
];

/** At the foot of the app sidebar. */
export const SETTINGS_ENTRY: NavEntry = { id: "ajustes", label: "Ajustes de la app", scope: "product", path: "/ajustes", icon: "settings" };

export const ALL_NAV_ENTRIES: NavEntry[] = [...NAV_GROUPS.flatMap((g) => g.entries), SETTINGS_ENTRY];

/**
 * The link of an entry for a market. Product-level entries carry the market as `?m=` so their pages
 * (and the way back) keep the country the user came from.
 */
export function navHref(entry: NavEntry, market: { productSlug: string; country: string }): string {
  if (entry.scope === "market") return marketPath(market, entry.path);
  return productPath(market.productSlug, `${entry.path}?m=${market.country.toLowerCase()}`);
}

/** The pieces of an app URL: `/a/[slug]/[country]/…` (market) or `/a/[slug]/creativos|ajustes/…` (product). */
export function parseAppPath(pathname: string): { slug: string; country: string | null; rest: string[] } | null {
  const parts = pathname.split("?")[0].split("/").filter(Boolean);
  if (parts[0] !== "a" || !parts[1]) return null;
  const [, slug, second, ...tail] = parts;
  if (second && /^[a-z]{2}$/.test(second)) return { slug, country: second, rest: tail };
  return { slug, country: null, rest: second ? [second, ...tail] : [] };
}

/** The entry a path belongs to, or null (outside an app). */
export function activeNavId(pathname: string): string | null {
  const parsed = parseAppPath(pathname);
  if (!parsed) return null;
  const [first] = parsed.rest;
  if (parsed.country === null) {
    if (first === "creativos") return "creativos";
    if (first === "ajustes") return "ajustes";
    return null;
  }
  if (first === undefined) return "resumen";
  const entry = ALL_NAV_ENTRIES.find((e) => e.scope === "market" && (e.path === `/${first}` || e.also?.includes(first)));
  return entry?.id ?? null;
}

/**
 * The same sub-page in another market: `/a/x/es/resenas` → `/a/x/us/resenas`. A keyword's page goes to
 * the keyword list (another market may not follow it). Product-level pages stay where they are; the query
 * is dropped (filters and listing targets belong to the market).
 */
export function switchMarketPath(pathname: string, country: string): string {
  const parsed = parseAppPath(pathname);
  if (!parsed) return pathname.split("?")[0];
  const cc = country.toLowerCase();
  if (parsed.country === null) return `/a/${parsed.slug}${parsed.rest.length ? `/${parsed.rest.join("/")}` : ""}`;
  let rest = parsed.rest;
  if (rest[0] === "keywords" && rest.length > 1) rest = ["keywords"];
  return marketPath({ productSlug: parsed.slug, country: cc }, rest.length ? `/${rest.join("/")}` : "");
}

/** Name of the cookie that remembers the last market seen of a product (for its product-level pages). */
export const marketCookieName = (slug: string) => `rk-m-${slug}`;

/** The market to use on a product-level page: `?m=`, then the cookie, then the primary one (the first). */
export function pickMarket<T extends { country: string }>(markets: readonly T[], fromQuery?: string | null, fromCookie?: string | null): T | undefined {
  const find = (cc?: string | null) => (cc ? markets.find((m) => m.country === cc.toLowerCase()) : undefined);
  return find(fromQuery) ?? find(fromCookie) ?? markets[0];
}

/** Regional indicator flag for a two-letter country code («es» → 🇪🇸). */
export function flag(country: string): string {
  const cc = country.toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return "";
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
