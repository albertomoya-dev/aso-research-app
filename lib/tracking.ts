import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getCountry } from "./countries";
import { normalizeKeyword } from "./keywords";
import { autocompleteScore, difficultyScore, MAX_PREFIX, measureAutocomplete } from "./popularity";
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

/**
 * Deploy date of the current popularity algorithm. Before it, popularity typed at most 12 letters
 * (a 0 for a longer keyword meant «not measured») and scored on another scale. Keywords longer than
 * 12 letters measured before this date whose stored value may come from the old algorithm
 * (`oldAlgorithmShape`) are measured again (at most MAX_REMEASURE_PER_RUN per run); shorter ones kept
 * the same scale and wait for their weekly refresh.
 * It must be ON OR AFTER the day this algorithm is deployed: an earlier date would leave rows measured by
 * the old algorithm in between without their re-measure. A later one costs repeated re-measures: a row
 * the new algorithm measures before this date keeps a popularityAt before it, so when its value cannot be
 * told from an old one (a 0 not suggested, or a score both scales give) it is picked again on every run
 * until this date, within the per-run cap. Rows the new algorithm found after letter 12, or scored with a
 * value the old scale never gives, are recognised and skipped. Expected deploy: by 2026-11-03.
 */
export const FULL_TERM_POPULARITY_SINCE = new Date("2026-11-03T00:00:00Z");

/**
 * One-time re-measures (see FULL_TERM_POPULARITY_SINCE) per run, oldest first: each one types up to 16
 * prefixes in the store, so doing them all at once risks a 429 from Google Play and the cron's time. The
 * rest wait for the next runs, which also spreads their weekly refresh over several days.
 */
export const MAX_REMEASURE_PER_RUN = 25;

type StoredPopularity = { popularity: number | null; prefixLength: number | null; popularityAt: Date | null };

/** Scores the old algorithm gave at `prefixLength` letters (any list position): scale min(length, 12). */
function oldScores(prefixLength: number, termLength: number): Set<number> {
  const length = Math.min(termLength, MAX_PREFIX);
  const prefixFactor = 1 - (Math.min(prefixLength, length) - 1) / length;
  return new Set(Array.from({ length: 11 }, (_, i) => Math.max(1, Math.round(100 * prefixFactor * (1 - i * 0.05)))));
}

/** Scores the current algorithm gives at `prefixLength` letters (any list position). */
function newScores(prefixLength: number, target: string): Set<number> {
  return new Set(Array.from({ length: 11 }, (_, i) => autocompleteScore(prefixLength, i, target)));
}

/**
 * Whether the stored value may come from the old algorithm and differ from the current one. The old one
 * never stored a prefix over 12 letters, and scored a keyword found at `prefixLength` letters only with
 * the values of `oldScores`: anything else was measured by the current algorithm. A 0 «not suggested»
 * (prefix null) can come from either, and so can a value both scales give: they count as old. A keyword
 * found at the first letter, or whose current scale is 12 letters too, scores the same either way.
 */
function oldAlgorithmShape(stored: StoredPopularity, term: string): boolean {
  const { popularity, prefixLength } = stored;
  if (prefixLength == null || popularity == null) return true;
  if (prefixLength > MAX_PREFIX) return false;
  const target = normalizeKeyword(term);
  const before = oldScores(prefixLength, target.length);
  const now = newScores(prefixLength, target);
  if (before.size === now.size && [...before].every((v) => now.has(v))) return false;
  return before.has(popularity);
}

/** Measured before the current algorithm, longer than the old one could type, and possibly by it: due for a re-measure. */
function needsRemeasure(stored: StoredPopularity, term: string): boolean {
  return (
    term.length > MAX_PREFIX &&
    stored.popularityAt != null &&
    stored.popularityAt < FULL_TERM_POPULARITY_SINCE &&
    oldAlgorithmShape(stored, term)
  );
}

/** Whether a stored popularity must be measured again (weekly, or the one-time re-measure). Exported for tests. */
export function popularityIsStale(stored: StoredPopularity | undefined, term: string): boolean {
  if (!stored || isStale(stored.popularityAt)) return true;
  return needsRemeasure(stored, term);
}

/**
 * Keys of the keywords whose one-time re-measure happens in this run: only those not already due for
 * their weekly refresh, at most `max`, the oldest measurements first. Exported for tests.
 */
export function pickRemeasures(
  candidates: { key: string; term: string; stored: StoredPopularity | undefined }[],
  max = MAX_REMEASURE_PER_RUN,
): Set<string> {
  return new Set(
    candidates
      .filter((c): c is typeof c & { stored: StoredPopularity } => c.stored != null && !isStale(c.stored.popularityAt) && needsRemeasure(c.stored, c.term))
      .sort((a, b) => (a.stored.popularityAt?.getTime() ?? 0) - (b.stored.popularityAt?.getTime() ?? 0) || a.key.localeCompare(b.key))
      .slice(0, max)
      .map((c) => c.key),
  );
}
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Searches each keyword once per store and country, then stores today's position and
 * TOP 5 for every followed app that uses it, and the keyword's difficulty. Popularity
 * (store autocomplete) and Google Trends are refreshed when older than a week; no popularity
 * measure starts after `options.popularityDeadline`. Running it twice on the same day overwrites.
 */
export async function trackRankings(
  filter: { appId?: number; keywordIds?: number[] } = {},
  options: {
    /** Epoch ms after which no popularity measure starts (positions are still searched); they wait for the next run. */
    popularityDeadline?: number;
  } = {},
): Promise<TrackingReport> {
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
  const storedPopularity = new Map(metrics.map((m) => [`${m.keywordId}|${m.store}|${m.country}`, m]));
  const trendsAt = new Map(trends.map((t) => [`${t.keywordId}|${t.country}`, t.fetchedAt]));

  const groups = Map.groupBy(targets, (t) => `${t.store}|${t.country}|${t.term}`);
  const date = today();
  const popularityKey = (t: Target) => `${t.keywordId}|${t.store}|${t.country}`;
  const remeasure = pickRemeasures(
    [...groups.values()].map(([t]) => ({ key: popularityKey(t), term: t.term, stored: storedPopularity.get(popularityKey(t)) })),
  );
  const popularityDue = (t: Target) => {
    const stored = storedPopularity.get(popularityKey(t));
    return !stored || isStale(stored.popularityAt) || remeasure.has(popularityKey(t));
  };
  const popularityDeadline = options.popularityDeadline ?? Infinity;

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
      // Past the deadline, a due measure waits for the next run (it is still stale then).
      if (popularityDue(group[0]) && Date.now() <= popularityDeadline) {
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
