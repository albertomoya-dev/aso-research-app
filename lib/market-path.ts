// Pure URL helpers for products and markets (no database), usable from client components and tests.
//
// A product is an app of one store (`products`); a market is that app in one country (a row of
// `apps`). URLs: `/a/[slug]/[country]/…` for what depends on the country (keywords, reviews, the
// listing…), `/a/[slug]/…` for what belongs to the app as a whole (creatives, the product sheet).

export const SLUG_MAX = 40;

/** Lower case, no accents, words joined by hyphens, at most 40 characters. "" when nothing is left. */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/, "");
}

/**
 * The slug a new product starts from: the tail of the store id when it has letters
 * («com.moyalogames.recordatorio» → «recordatorio»), else the title (iOS ids are numbers), else «app».
 * Same rule as the backfill of migration 0019.
 */
export function productSlugBase(storeId: string, title: string): string {
  const tail = slugify(storeId.replace(/^.*\./, ""));
  if (/[a-z]/.test(tail)) return tail;
  return slugify(title) || "app";
}

/** `base`, or `base-2`, `base-3`… (still at most 40 characters) for the first one not taken. */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const candidate = base.slice(0, SLUG_MAX - suffix.length).replace(/-+$/, "") + suffix;
    if (!taken.has(candidate)) return candidate;
  }
}

/** What a market URL needs: the product's slug and the market's country. */
export type MarketRef = { productSlug: string; country: string };

/** `/a/[slug]`, plus `sub` (starting with «/»), for the pages of the app as a whole. */
export function productPath(productSlug: string, sub = ""): string {
  return `/a/${productSlug}${sub}`;
}

/** `/a/[slug]/[country]`, plus `sub` (starting with «/» or «?»). The country goes in lower case. */
export function marketPath(market: MarketRef, sub = ""): string {
  return `${productPath(market.productSlug)}/${market.country.toLowerCase()}${sub}`;
}

/** Old tab (`/apps/[id]/…`) → new section of the market. Renamed ones: metadata → ficha, estacionalidad → tendencias. */
const MARKET_SECTIONS: Record<string, string> = {
  keywords: "keywords",
  resenas: "resenas",
  competidores: "competidores",
  estacionalidad: "tendencias",
  cambios: "cambios",
  metadata: "ficha",
};

/** Sub-pages that exist under each new section (anything else is a 404, not a redirect). */
const MARKET_SUBPAGES: Record<string, (rest: string[]) => boolean> = {
  keywords: (rest) => rest.length === 0 || (rest.length === 1 && /^\d+$/.test(rest[0])),
  ficha: (rest) => rest.length === 0 || (rest.length === 1 && rest[0] === "publicar"),
};
const CREATIVE_SUBPAGES = new Set(["icono", "logo", "video"]);

/**
 * The three old find pages are one screen since phase 29: `/encontrar?fuente=…`. Shared with the 308s of
 * the new paths (lib/redirects.ts), so an old `/apps/[id]/descubrir` goes straight to the end.
 */
export const FIND_PAGE_SOURCES = { descubrir: "autocompletado", ideas: "ia", top10: "top10" } as const;

/**
 * `/encontrar?…&fuente=…`: the old query (`seed`, `kw`, `term`…) first and then the source, the order in
 * which the next.config 308 builds it.
 */
export function findPath(market: MarketRef, page: keyof typeof FIND_PAGE_SOURCES, search = ""): string {
  const query = new URLSearchParams(search);
  query.delete("fuente");
  query.append("fuente", FIND_PAGE_SOURCES[page]);
  return marketPath(market, `/encontrar?${query}`);
}

/**
 * Where an old URL `/apps/[id]/[...rest]` lives now, or null when it never existed (→ 404).
 * `/apps/[id]` goes to the keywords of the market, the old «Producto» tab to the app settings and
 * «Creativos» to the app (no country). `search` («?…» or "") is kept.
 */
export function legacyAppRedirect(market: MarketRef, rest: readonly string[] = [], search = ""): string | null {
  const [section, ...tail] = rest;
  if (section === undefined) return marketPath(market, `/keywords${search}`);
  if (section === "producto") return tail.length === 0 ? productPath(market.productSlug, `/ajustes/producto${search}`) : null;
  if (section === "creativos") {
    if (tail.length === 0) return productPath(market.productSlug, `/creativos${search}`);
    return tail.length === 1 && CREATIVE_SUBPAGES.has(tail[0]) ? productPath(market.productSlug, `/creativos/${tail[0]}${search}`) : null;
  }
  if (Object.hasOwn(FIND_PAGE_SOURCES, section)) return tail.length === 0 ? findPath(market, section as keyof typeof FIND_PAGE_SOURCES, search) : null;
  const target = MARKET_SECTIONS[section];
  if (!target) return null;
  const allowed = MARKET_SUBPAGES[target] ?? ((r: string[]) => r.length === 0);
  if (!allowed(tail)) return null;
  return marketPath(market, `/${[target, ...tail].join("/")}${search}`);
}

/** The id of an old `/apps/[id]` URL: a positive integer, else null (so `/apps/nueva` is never read as an id). */
export function legacyAppId(segment: string): number | null {
  if (!/^[1-9]\d{0,9}$/.test(segment)) return null;
  const id = Number(segment);
  return Number.isSafeInteger(id) && id <= 2_147_483_647 ? id : null;
}

/** A followed product with its markets (oldest first: the first one is the primary market). */
export type ProductWithMarkets = {
  id: number;
  slug: string;
  title: string;
  icon: string;
  store: "ios" | "android";
  developer: string;
  markets: { id: number; country: string; keywords: number }[];
};

type MarketRow = Omit<ProductWithMarkets, "id" | "markets"> & { productId: number; marketId: number; country: string; keywords: number };

/** One entry per product from rows of (product, market), keeping the order products first appear in. */
export function groupMarkets(rows: readonly MarketRow[]): ProductWithMarkets[] {
  const byId = new Map<number, ProductWithMarkets>();
  for (const r of rows) {
    let product = byId.get(r.productId);
    if (!product) {
      // Developer of the first market listed: they all are the same store listing.
      product = { id: r.productId, slug: r.slug, title: r.title, icon: r.icon, store: r.store, developer: r.developer, markets: [] };
      byId.set(r.productId, product);
    }
    product.markets.push({ id: r.marketId, country: r.country, keywords: r.keywords });
  }
  for (const p of byId.values()) p.markets.sort((a, b) => a.id - b.id);
  return [...byId.values()];
}

/**
 * The confirmation before unfollowing a market. The app-wide data (product sheet, brand exceptions,
 * creatives) belongs to the product: it is kept while another country is followed, and goes only with
 * the last one. Country names, not codes; `others` are the other markets still followed.
 */
export function unfollowConfirmation(title: string, country: string, others: readonly string[]): string {
  if (others.length === 0) {
    return `¿Dejar de seguir ${title}? Es el último país que sigues: se borrarán sus keywords, su histórico, la ficha de producto, las marcas excluidas y los creativos.`;
  }
  const list = others.length === 1 ? others[0] : `${others.slice(0, -1).join(", ")} y ${others[others.length - 1]}`;
  return `¿Dejar de seguir ${title} en ${country}? Se borrarán las keywords y el histórico de ${country}. La ficha de producto, las marcas excluidas y los creativos se conservan porque sigues la app en ${list}.`;
}

/** Unique violation on products.slug (Postgres 23505), as the Neon driver reports it. */
export function isSlugClash(error: unknown): boolean {
  const e = error as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } } | null;
  const code = e?.code ?? e?.cause?.code;
  const constraint = e?.constraint ?? e?.cause?.constraint ?? "";
  return code === "23505" && constraint.includes("slug");
}
