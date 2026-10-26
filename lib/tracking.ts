import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getCountry } from "./countries";
import { computeRank, RANK_DEPTH, today } from "./ranking";
import { getAdapter } from "./stores";
import type { Store } from "./stores/types";

type Target = { appId: number; storeId: string; store: Store; country: string; keywordId: number; term: string };

export type TrackingReport = { searches: number; snapshots: number; errors: { term: string; store: Store; country: string; message: string }[] };

/**
 * Searches each keyword once per store and country, then stores today's position and
 * TOP 5 for every followed app that uses it. Running it twice on the same day overwrites.
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

  const groups = new Map<string, Target[]>();
  for (const t of targets) {
    const key = `${t.store}|${t.country}|${t.term}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }

  const date = today();
  const report: TrackingReport = { searches: 0, snapshots: 0, errors: [] };

  // The store adapters cap concurrency, so the searches can be started together.
  await Promise.all(
    [...groups.values()].map(async (group) => {
      const { store, country, term } = group[0];
      try {
        const results = await getAdapter(store).searchApps(term, {
          country,
          lang: getCountry(country).lang,
          limit: RANK_DEPTH,
        });
        report.searches++;
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
            set: {
              position: sql`excluded.position`,
              top5: sql`excluded.top5`,
              depth: sql`excluded.depth`,
            },
          });
        report.snapshots += rows.length;
      } catch (error) {
        report.errors.push({ term, store, country, message: error instanceof Error ? error.message : String(error) });
      }
    }),
  );
  return report;
}
