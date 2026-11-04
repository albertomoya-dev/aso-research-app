import { and, asc, count, eq, like, or } from "drizzle-orm";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getDb, schema } from "@/db";
import type { App, Product } from "@/db/schema";
import { marketCookieName, pickMarket } from "./app-nav";
import { groupMarkets, isSlugClash, type MarketRef, productSlugBase, type ProductWithMarkets, uniqueSlug } from "./market-path";

export {
  legacyAppRedirect,
  marketPath,
  productPath,
  slugify,
  unfollowConfirmation,
  type MarketRef,
  type ProductWithMarkets,
} from "./market-path";
export type { Market, Product } from "@/db/schema";

/** A market row (`apps`) with the slug of its product: everything `marketPath()` needs. */
export type MarketApp = App & { productSlug: string };

/** The product for a route param, or a 404. Cached per request. */
export const loadProduct = cache(async (slug: string): Promise<Product> => {
  const product = await getDb().query.products.findFirst({ where: eq(schema.products.slug, slug) });
  if (!product) notFound();
  return product;
});

/**
 * The market of `/a/[slug]/[country]`: the same `apps` row the old `/apps/[id]` pages loaded, plus
 * the product slug. A 404 when the product or the country is not followed. Cached per request so
 * metadata, layout and page share one query.
 */
export const loadMarket = cache(async (slug: string, country: string): Promise<MarketApp> => {
  if (!/^[a-z]{2}$/.test(country)) notFound();
  const product = await loadProduct(slug);
  const app = await getDb().query.apps.findFirst({
    where: and(eq(schema.apps.productId, product.id), eq(schema.apps.country, country)),
  });
  if (!app) notFound();
  return { ...app, productSlug: product.slug };
});

/** Every market of the product, oldest first (the first one is the primary market). */
export async function productMarkets(productId: number): Promise<App[]> {
  return getDb().select().from(schema.apps).where(eq(schema.apps.productId, productId)).orderBy(asc(schema.apps.id));
}

/**
 * The primary market: the lowest `apps.id` of the product. The app-wide pages (creatives, product
 * settings) use it only as the market whose listing and keywords feed the AI and the links; the
 * app-wide data itself is keyed by `product_id` (migration 0020). Cached per request.
 */
export const primaryMarket = cache(async (productId: number): Promise<MarketApp> => {
  const [row] = await getDb()
    .select({ app: schema.apps, productSlug: schema.products.slug })
    .from(schema.apps)
    .innerJoin(schema.products, eq(schema.products.id, schema.apps.productId))
    .where(eq(schema.apps.productId, productId))
    .orderBy(asc(schema.apps.id))
    .limit(1);
  if (!row) notFound();
  return { ...row.app, productSlug: row.productSlug };
});

/**
 * The product of the market `marketId`: the key of the app-wide data (product sheet, brand exceptions,
 * creatives), the same in every country. Null when the market does not exist. Cached per request.
 */
export const marketProductId = cache(async (marketId: number): Promise<number | null> => {
  const [row] = await getDb()
    .select({ productId: schema.apps.productId })
    .from(schema.apps)
    .where(eq(schema.apps.id, marketId));
  return row?.productId ?? null;
});

/** Slug and country of a market, for links and revalidation when only its id is known. Null if it does not exist. */
export async function marketRef(appId: number): Promise<MarketRef | null> {
  const [row] = await getDb()
    .select({ productSlug: schema.products.slug, country: schema.apps.country })
    .from(schema.apps)
    .innerJoin(schema.products, eq(schema.products.id, schema.apps.productId))
    .where(eq(schema.apps.id, appId));
  return row ?? null;
}

/**
 * What a freshly fetched listing of market `marketId` changes in its product: title and icon, only when
 * it is the primary market (the lowest `apps.id` of the product) and they differ. The slug never changes
 * (links and bookmarks keep working). Null: nothing to update.
 */
export function productListingUpdate(
  marketId: number,
  marketIds: readonly number[],
  product: { title: string; icon: string },
  listing: { title: string; icon: string },
): { title: string; icon: string } | null {
  if (marketIds.length === 0 || marketId !== Math.min(...marketIds)) return null;
  const title = listing.title.trim() || product.title;
  const icon = listing.icon || product.icon;
  return title === product.title && icon === product.icon ? null : { title, icon };
}

/**
 * Keeps the product's title and icon in step with its primary market's listing. Called whenever a
 * market's listing is refreshed (the daily job and «Actualizar ficha»); other markets change nothing.
 */
export async function syncProductListing(marketId: number, listing: { title: string; icon: string }): Promise<boolean> {
  const db = getDb();
  const [market] = await db
    .select({ productId: schema.apps.productId, title: schema.products.title, icon: schema.products.icon })
    .from(schema.apps)
    .innerJoin(schema.products, eq(schema.products.id, schema.apps.productId))
    .where(eq(schema.apps.id, marketId));
  if (!market) return false;
  const markets = await db.select({ id: schema.apps.id }).from(schema.apps).where(eq(schema.apps.productId, market.productId));
  const update = productListingUpdate(
    marketId,
    markets.map((m) => m.id),
    market,
    listing,
  );
  if (!update) return false;
  await db.update(schema.products).set(update).where(eq(schema.products.id, market.productId));
  return true;
}

/**
 * The product of (store, store id), created when the app is followed for the first time, with a free
 * slug. Title and icon start as the first market's and then follow the primary market's listing
 * (`syncProductListing`); later countries do not overwrite them.
 */
export async function ensureProduct(app: { store: "ios" | "android"; storeId: string; title: string; icon: string }): Promise<Product> {
  const db = getDb();
  const where = and(eq(schema.products.store, app.store), eq(schema.products.storeId, app.storeId));
  const existing = await db.query.products.findFirst({ where });
  if (existing) return existing;
  const base = productSlugBase(app.storeId, app.title);
  const taken = await db
    .select({ slug: schema.products.slug })
    .from(schema.products)
    .where(or(eq(schema.products.slug, base), like(schema.products.slug, `${base.slice(0, 36)}%-%`)));
  const used = new Set(taken.map((t) => t.slug));
  // Two different apps with the same slug base followed at once can pick the same free slug: on a
  // slug clash, mark it as used and try the next one.
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = uniqueSlug(base, used);
    try {
      const [created] = await db
        .insert(schema.products)
        .values({ store: app.store, storeId: app.storeId, slug, title: app.title, icon: app.icon })
        .onConflictDoNothing({ target: [schema.products.store, schema.products.storeId] })
        .returning();
      // Lost a race with another request following the same app: use its row.
      return created ?? (await db.query.products.findFirst({ where }))!;
    } catch (error) {
      if (!isSlugClash(error)) throw error;
      used.add(slug);
    }
  }
  throw new Error("No se ha podido crear la app: inténtalo de nuevo.");
}

/** `loadMarket` straight from the `params` of a `/a/[app]/[market]/…` page or layout. */
export async function loadMarketParams(params: Promise<{ app: string; market: string }>): Promise<MarketApp> {
  const { app, market } = await params;
  return loadMarket(app, market);
}

/**
 * For the app-wide pages (`/a/[app]/creativos`, `/a/[app]/ajustes/…`): the product's primary market,
 * the context for the AI and the links. Their data is read by `productId`, which every market shares.
 */
export async function loadPrimaryParams(params: Promise<{ app: string }>): Promise<MarketApp> {
  const product = await loadProduct((await params).app);
  return primaryMarket(product.id);
}

/**
 * The market an app-wide page works with (Ajustes › Marcas, Datos de Play Console): `?m=` when given,
 * else the last market seen of this product (cookie set by the app shell), else the primary one.
 */
export async function loadContextMarket(slug: string, fromQuery?: string | string[] | null): Promise<MarketApp> {
  const product = await loadProduct(slug);
  const [markets, jar] = await Promise.all([
    getDb().select({ country: schema.apps.country }).from(schema.apps).where(eq(schema.apps.productId, product.id)).orderBy(asc(schema.apps.id)),
    cookies(),
  ]);
  const picked = pickMarket(markets, typeof fromQuery === "string" ? fromQuery : null, jar.get(marketCookieName(slug))?.value);
  if (!picked) notFound();
  return loadMarket(slug, picked.country);
}

/** Every followed product, by title, with its markets oldest first: for the home page and the sidebar. One query. */
export async function listProducts(): Promise<ProductWithMarkets[]> {
  const rows = await getDb()
    .select({
      productId: schema.products.id,
      slug: schema.products.slug,
      title: schema.products.title,
      icon: schema.products.icon,
      store: schema.products.store,
      developer: schema.apps.developer,
      marketId: schema.apps.id,
      country: schema.apps.country,
      keywords: count(schema.appKeywords.keywordId),
    })
    .from(schema.apps)
    .innerJoin(schema.products, eq(schema.products.id, schema.apps.productId))
    .leftJoin(schema.appKeywords, eq(schema.appKeywords.appId, schema.apps.id))
    .groupBy(schema.apps.id, schema.products.id)
    .orderBy(asc(schema.products.title), asc(schema.products.id), asc(schema.apps.id));
  return groupMarkets(rows);
}
