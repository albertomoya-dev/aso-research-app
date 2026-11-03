import { asc, eq, sql } from "drizzle-orm";
import { cache } from "react";
import { getDb, hasDatabase, schema } from "@/db";
import { unreadAlertCount } from "./alert-jobs";
import { pendingCandidatesSql } from "./candidate-queries";
import { listProducts, type ProductWithMarkets } from "./products";

/** What the app sidebar and header show for one market. */
export type MarketCounters = {
  /** Ideas with AI still pending. */
  ideas: number;
  /** The pending tray of Encontrar: AI ideas plus review words and measured candidates not decided yet. */
  pending: number;
  /** Alerts of this market not read yet (Resumen). */
  alerts: number;
  /** Day of the latest rank check (YYYY-MM-DD), for «Posiciones del…». */
  lastCheck: string | null;
};

/**
 * Counters of every market of a product, in ONE query (one row per market, correlated subqueries
 * on indexed `app_id` columns). Keyed by market id.
 */
export const marketCounters = cache(async (productId: number): Promise<Record<number, MarketCounters>> => {
  const a = schema.apps;
  const rows = await getDb()
    .select({
      id: a.id,
      ideas: sql<number>`(select count(*) from ${schema.aiSuggestions} s where s.app_id = ${a.id} and s.status = 'pending')`.mapWith(Number),
      pending: pendingCandidatesSql(a.id),
      alerts: sql<number>`(select count(*) from ${schema.alerts} al where al.app_id = ${a.id} and al.read_at is null)`.mapWith(Number),
      lastCheck: sql<string | null>`(select max(r.date)::text from ${schema.rankSnapshots} r where r.app_id = ${a.id})`,
    })
    .from(a)
    .where(eq(a.productId, productId));
  return Object.fromEntries(rows.map((r) => [r.id, { ideas: r.ideas, pending: r.pending, alerts: r.alerts, lastCheck: r.lastCheck }]));
});

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
