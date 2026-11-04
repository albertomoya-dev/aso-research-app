import { asc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { cache } from "react";
import { getDb, hasDatabase, schema } from "@/db";
import { unreadAlertCount } from "./alert-jobs";
import { pendingCandidatesSql } from "./candidate-queries";
import { countNewReviewSources, jsonValue, listingWarningCount, type ListingWarningsInput, type ReviewCheck } from "./nav-counters";
import { listProducts, type ProductWithMarkets } from "./products";

/** What the app sidebar and header show for one market. */
export type MarketCounters = {
  /** The pending tray of Encontrar: AI ideas plus review words and measured candidates not decided yet. */
  pending: number;
  /** Alerts of this market not read yet (Resumen). */
  alerts: number;
  /** Review sources with reviews newer than their last analysis (the dot of Reseñas). */
  reviews: number;
  /** Store rule errors and warnings of the main listing (draft or published), as on Ficha. */
  listing: number;
  /** Day of the latest rank check (YYYY-MM-DD), for «Posiciones del…». */
  lastCheck: string | null;
};

/** A Drizzle Postgres database with the app's schema (Neon in the app, PGlite in the tests). */
type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

// The market's own columns, ALWAYS qualified: in a one-table select Drizzle writes `${apps.id}` as a bare
// "id", which inside a correlated subquery binds to the subquery's own table (al.id, s.id…), not the market.
const marketId = sql`${sql.identifier("apps")}.${sql.identifier("id")}`;
const marketCountry = sql`${sql.identifier("apps")}.${sql.identifier("country")}`;

/** The raw counter rows of every market of a product, in ONE query (correlated subqueries on indexed `app_id` columns). */
export function marketCounterRows(db: Db, productId: number) {
  const a = schema.apps;
  return db
    .select({
      id: a.id,
      store: a.store,
      country: a.country,
      meta: a.meta,
      pending: pendingCandidatesSql(marketId),
      alerts: sql<number>`(select count(*) from ${schema.alerts} al where al.app_id = ${marketId} and al.read_at is null)`.mapWith(Number),
      lastCheck: sql<string | null>`(select max(r.date)::text from ${schema.rankSnapshots} r where r.app_id = ${marketId})`,
      // Each checked source with its last analysis in this market's country (as Reseñas compares them).
      reviewChecks: sql<unknown>`(
        select coalesce(json_agg(json_build_object('latest', f.latest_review_at, 'to', la.stats->'to')), '[]'::json)
        from ${schema.reviewFreshness} f
        join lateral (
          select ra.stats from ${schema.reviewAnalyses} ra
          where ra.app_id = f.app_id and ra.target_store_id = f.target_store_id and ra.country = ${marketCountry}
          order by ra.created_at desc limit 1
        ) la on true
        where f.app_id = ${marketId} and f.latest_review_at is not null
      )`,
      drafts: sql<unknown>`(
        select coalesce(json_agg(json_build_object('locale', d.locale, 'draft', d.draft)), '[]'::json)
        from ${schema.listingDrafts} d where d.app_id = ${marketId} and d.country = ''
      )`,
      keywords: sql<unknown>`(
        select coalesce(json_agg(k.term), '[]'::json)
        from ${schema.appKeywords} ak join ${schema.keywords} k on k.id = ak.keyword_id where ak.app_id = ${marketId}
      )`,
    })
    .from(a)
    .where(eq(a.productId, productId));
}

/** The counters of each market from its raw row; Reseñas and Ficha with the same helpers as their pages. */
export function toMarketCounters(rows: Awaited<ReturnType<typeof marketCounterRows>>): Record<number, MarketCounters> {
  return Object.fromEntries(
    rows.map((r) => [
      r.id,
      {
        pending: r.pending,
        alerts: r.alerts,
        reviews: countNewReviewSources(jsonValue<ReviewCheck[]>(r.reviewChecks, [])),
        listing: listingWarningCount({
          store: r.store,
          country: r.country,
          meta: r.meta,
          drafts: jsonValue<ListingWarningsInput["drafts"]>(r.drafts, []),
          keywords: jsonValue<string[]>(r.keywords, []),
        }),
        lastCheck: r.lastCheck,
      },
    ]),
  );
}

/**
 * Counters of every market of a product, in ONE query (one row per market). Reseñas and Ficha get
 * their raw rows and are counted in TypeScript with the same helpers as their pages
 * (lib/nav-counters.ts); no store is called. Keyed by market id. Cached per request.
 */
export const marketCounters = cache(async (productId: number): Promise<Record<number, MarketCounters>> =>
  toMarketCounters(await marketCounterRows(getDb(), productId)),
);

/** The markets of a product for the app shell (oldest first: the first is the primary market). */
export const productNavMarkets = cache(async (productId: number): Promise<{ id: number; country: string; url: string }[]> =>
  getDb()
    .select({ id: schema.apps.id, country: schema.apps.country, url: schema.apps.url })
    .from(schema.apps)
    .where(eq(schema.apps.productId, productId))
    .orderBy(asc(schema.apps.id)),
);

/** Followed products for the app picker and the ⌘K palette; [] without a database or on error. One query per request. */
export const navProducts = cache(async (): Promise<ProductWithMarkets[]> => {
  if (!hasDatabase()) return [];
  try {
    return await listProducts();
  } catch {
    return [];
  }
});

/** Unread alerts of every app, for the Actividad badge; 0 on error. */
export const navUnreadAlerts = cache(async (): Promise<number> => {
  if (!hasDatabase()) return 0;
  try {
    return await unreadAlertCount();
  } catch {
    return 0;
  }
});
