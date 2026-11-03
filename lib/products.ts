import { and, asc, count, eq, like, or } from "drizzle-orm";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getDb, schema } from "@/db";
import type { App, Product } from "@/db/schema";
import { groupMarkets, type MarketRef, productSlugBase, type ProductWithMarkets, uniqueSlug } from "./market-path";

export { legacyAppRedirect, marketPath, productPath, slugify, type MarketRef, type ProductWithMarkets } from "./market-path";
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
 * The primary market: the lowest `apps.id` of the product. Until phase 26b the app-wide tables
 * (product sheet, brand exceptions, creatives) are read and written through it, so every country
 * shares them. Cached per request.
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
 * The `apps.id` that holds the app-wide data for the market `appId` (its product's primary market).
 * The market itself when it is unknown, so a bad id still finds nothing rather than another app's data.
 */
export const sharedAppId = cache(async (appId: number): Promise<number> => {
  const [row] = await getDb()
    .select({ productId: schema.apps.productId })
    .from(schema.apps)
    .where(eq(schema.apps.id, appId));
  if (!row) return appId;
  const [first] = await getDb()
    .select({ id: schema.apps.id })
    .from(schema.apps)
    .where(eq(schema.apps.productId, row.productId))
    .orderBy(asc(schema.apps.id))
    .limit(1);
  return first?.id ?? appId;
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
 * The product of (store, store id), created when the app is followed for the first time, with a free
 * slug. Title and icon are the first market's; they are not overwritten by later countries.
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
  const slug = uniqueSlug(base, new Set(taken.map((t) => t.slug)));
  const [created] = await db
    .insert(schema.products)
    .values({ store: app.store, storeId: app.storeId, slug, title: app.title, icon: app.icon })
    .onConflictDoNothing({ target: [schema.products.store, schema.products.storeId] })
    .returning();
  // Lost a race with another request following the same app: use its row.
  return created ?? (await db.query.products.findFirst({ where }))!;
}

/** `loadMarket` straight from the `params` of a `/a/[app]/[market]/…` page or layout. */
export async function loadMarketParams(params: Promise<{ app: string; market: string }>): Promise<MarketApp> {
  const { app, market } = await params;
  return loadMarket(app, market);
}

/**
 * For the app-wide pages (`/a/[app]/creativos`, `/a/[app]/ajustes/…`): the product's primary market,
 * which holds the app-wide data until phase 26b.
 */
export async function loadPrimaryParams(params: Promise<{ app: string }>): Promise<MarketApp> {
  const product = await loadProduct((await params).app);
  return primaryMarket(product.id);
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
