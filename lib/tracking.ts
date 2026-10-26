import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getCountry } from "./countries";
import { difficultyScore, measureAutocomplete } from "./popularity";
import { computeRank, RANK_DEPTH, today } from "./ranking";
import { getAdapter } from "./stores";
import type { Store } from "./stores/types";
import { fetchInterest } from "./trends";

type Target = { appId: number; storeId: string; store: Store; country: string; keywordId: number; term: string };

export type TrackingReport = {
  searches: number;
  snapshots: number;
  errors: { term: string; store?: Store; country: string; step: "ranking" | "popularity" | "trends"; message: string }[];
};

/** Popularity and Google Trends change slowly and cost many requests: refresh them weekly. */
const SLOW_METRICS_DAYS = 7;

/** Google Trends throttles hard: the rest wait for the next run. */
const MAX_TRENDS_PER_RUN = 20;

const isStale = (at: Date | null | undefined) => !at || Date.now() - at.getTime() > SLOW_METRICS_DAYS * 86_400_000;
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Searches each keyword once per store and country, then stores today's position and
 * TOP 5 for every followed app that uses it, and the keyword's difficulty. Popularity
 * (store autocomplete) and Google Trends are refreshed when older than a week.
 * Running it twice on the same day overwrites.
 */
export async function trackRankings(filter: { appId?: number; keywordIds?: number[] } = {}): Promise<TrackingReport> {
  const db = getDb();
  const targets: Target[] = await db
    .select({
      appId: schema.apps.id,
      storeId: schema.apps.storeId,
      store: schema.apps.store,
      country: schema.apps.country,
      keywordId: schema.keywords.id,
      term: schema.keywords.term,
    })
    .from(schema.appKeywords)
    .innerJoin(schema.apps, eq(schema.apps.id, schema.appKeywords.appId))
    .innerJoin(schema.keywords, eq(schema.keywords.id, schema.appKeywords.keywordId))
    .where(
      and(
        filter.appId ? eq(schema.apps.id, filter.appId) : undefined,
        filter.keywordIds ? inArray(schema.keywords.id, filter.keywordIds) : undefined,
      ),
    );
  const report: TrackingReport = { searches: 0, snapshots: 0, errors: [] };
  if (targets.length === 0) return report;

  const keywordIds = [...new Set(targets.map((t) => t.keywordId))];
  const [metrics, trends] = await Promise.all([
    db.select().from(schema.keywordMetrics).where(inArray(schema.keywordMetrics.keywordId, keywordIds)),
    db
      .select({ keywordId: schema.keywordTrends.keywordId, country: schema.keywordTrends.country, fetchedAt: schema.keywordTrends.fetchedAt })
      .from(schema.keywordTrends)
      .where(inArray(schema.keywordTrends.keywordId, keywordIds)),
  ]);
  const popularityAt = new Map(metrics.map((m) => [`${m.keywordId}|${m.store}|${m.country}`, m.popularityAt]));
  const trendsAt = new Map(trends.map((t) => [`${t.keywordId}|${t.country}`, t.fetchedAt]));

  const groups = Map.groupBy(targets, (t) => `${t.store}|${t.country}|${t.term}`);
  const date = today();

  // The store adapters cap concurrency, so the searches can be started together.
  await Promise.all(
    [...groups.values()].map(async (group) => {
      const { store, country, term, keywordId } = group[0];
      const adapter = getAdapter(store);
      const query = { country, lang: getCountry(country).lang };
      let difficulty: number | null = null;

      try {
        const results = await adapter.searchApps(term, { ...query, limit: RANK_DEPTH });
        report.searches++;
        difficulty = difficultyScore(results, term);
        const rows = group.map((t) => ({
          appId: t.appId,
          keywordId: t.keywordId,
          store,
          country,
          date,
          depth: results.length,
          ...computeRank(results, t.storeId),
        }));
        await db
          .insert(schema.rankSnapshots)
          .values(rows)
          .onConflictDoUpdate({
            target: [
              schema.rankSnapshots.appId,
              schema.rankSnapshots.keywordId,
              schema.rankSnapshots.store,
              schema.rankSnapshots.country,
              schema.rankSnapshots.date,
            ],
            set: { position: sql`excluded.position`, top5: sql`excluded.top5`, depth: sql`excluded.depth` },
          });
        report.snapshots += rows.length;
      } catch (error) {
        report.errors.push({ term, store, country, step: "ranking", message: message(error) });
      }

      let popularity: { popularity: number; prefixLength: number | null } | null = null;
      if (isStale(popularityAt.get(`${keywordId}|${store}|${country}`))) {
        try {
          popularity = await measureAutocomplete(term, (prefix) => adapter.suggest(prefix, query));
        } catch (error) {
          report.errors.push({ term, store, country, step: "popularity", message: message(error) });
        }
      }

      if (difficulty == null && popularity == null) return;
      const now = new Date();
      const values = {
        ...(difficulty != null && { difficulty, difficultyAt: now }),
        ...(popularity && { ...popularity, popularityAt: now }),
      };
      await db
        .insert(schema.keywordMetrics)
        .values({ keywordId, store, country, ...values })
        .onConflictDoUpdate({
          target: [schema.keywordMetrics.keywordId, schema.keywordMetrics.store, schema.keywordMetrics.country],
          set: values,
        });
    }),
  );

  // Google Trends is per country, not per store.
  const staleTrends = [...Map.groupBy(targets, (t) => `${t.keywordId}|${t.country}`)]
    .filter(([key]) => isStale(trendsAt.get(key)))
    .map(([, [t]]) => t)
    .slice(0, MAX_TRENDS_PER_RUN);
  await Promise.all(
    staleTrends.map(async ({ keywordId, term, country }) => {
      let points = null;
      let error: string | null = null;
      try {
        points = await fetchInterest(term, country, getCountry(country).lang);
      } catch (e) {
        error = message(e);
        report.errors.push({ term, country, step: "trends", message: error });
      }
      // A failure is retried the next day instead of a week later.
      const fetchedAt = new Date(Date.now() - (error ? (SLOW_METRICS_DAYS - 1) * 86_400_000 : 0));
      const values = { points, error, fetchedAt };
      await db
        .insert(schema.keywordTrends)
        .values({ keywordId, country, ...values })
        .onConflictDoUpdate({ target: [schema.keywordTrends.keywordId, schema.keywordTrends.country], set: values });
    }),
  );

  return report;
}
