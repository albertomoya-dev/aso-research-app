import { and, eq, inArray } from "drizzle-orm";
import pLimit from "p-limit";
import { getDb, schema } from "@/db";
import { getCountry } from "./countries";
import { today } from "./ranking";
import { getAdapter } from "./stores";

// The dot of «reseñas nuevas» on Reseñas (phase 31). Reviews are not stored, so the daily job asks the
// store for the single newest review of every source (our app, the watched competitors and the apps
// analysed before) once a day, and keeps only its date. The page compares it with the `stats.to` of the
// last analysis; it never calls the store itself.

/** Sources read in one run at most: one store request each. */
export const MAX_FRESHNESS_SOURCES = 80;

/**
 * True when the store shows a review newer than the newest one the last analysis read. No analysis, or no
 * check yet, means no dot: there is nothing to compare. An analysis that found no reviews (`to` null) is
 * outdated as soon as the store shows any.
 */
export function hasNewReviews(latestReviewAt: Date | string | null | undefined, analysis: { to: string | null } | null | undefined): boolean {
  if (!analysis || latestReviewAt == null) return false;
  const latest = new Date(latestReviewAt).getTime();
  if (Number.isNaN(latest)) return false;
  if (analysis.to == null) return true;
  const to = new Date(analysis.to).getTime();
  return Number.isNaN(to) ? false : latest > to;
}

export type FreshnessSource = { appId: number; targetStoreId: string };
type CheckedRow = FreshnessSource & { checkedOn: string };

/** The sources still to check today, in order, at most `max`: one never checked or checked on an earlier day. */
export function sourcesToCheck(sources: FreshnessSource[], checked: CheckedRow[], date: string, max = MAX_FRESHNESS_SOURCES): FreshnessSource[] {
  const done = new Set(checked.filter((c) => c.checkedOn >= date).map((c) => `${c.appId}:${c.targetStoreId}`));
  const seen = new Set<string>();
  const out: FreshnessSource[] = [];
  for (const s of sources) {
    const key = `${s.appId}:${s.targetStoreId}`;
    if (done.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

export type FreshnessReport = { checked: number; skipped: number; errors: number };

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Daily step of the cron: for every market, the newest review date of each review source, read with one
 * store request (`limit: 1`) per source and day. Stops starting requests at `deadline` (epoch ms); what is
 * left is read the next day. Sources: our app, the watched competitors and every app analysed before.
 */
export async function trackReviewFreshness(deadline = Infinity): Promise<FreshnessReport> {
  const db = getDb();
  const [apps, watched, analysed, checked] = await Promise.all([
    db.select({ id: schema.apps.id, store: schema.apps.store, storeId: schema.apps.storeId, country: schema.apps.country }).from(schema.apps),
    db.select({ appId: schema.competitors.appId, targetStoreId: schema.competitors.storeId }).from(schema.competitors),
    db.selectDistinct({ appId: schema.reviewAnalyses.appId, targetStoreId: schema.reviewAnalyses.targetStoreId }).from(schema.reviewAnalyses),
    db
      .select({ appId: schema.reviewFreshness.appId, targetStoreId: schema.reviewFreshness.targetStoreId, checkedOn: schema.reviewFreshness.checkedOn })
      .from(schema.reviewFreshness),
  ]);
  const byId = new Map(apps.map((a) => [a.id, a]));
  const all: FreshnessSource[] = [
    ...apps.map((a) => ({ appId: a.id, targetStoreId: a.storeId })),
    ...watched,
    ...analysed,
  ].filter((s) => byId.has(s.appId));
  const date = today();
  const due = sourcesToCheck(all, checked, date);
  const report: FreshnessReport = { checked: 0, skipped: 0, errors: 0 };
  const limit = pLimit(4);

  await Promise.all(
    due.map((source) =>
      limit(async () => {
        if (Date.now() >= deadline) {
          report.skipped++;
          return;
        }
        const app = byId.get(source.appId)!;
        let latestReviewAt: Date | null = null;
        let error: string | null = null;
        try {
          const [newest] = await getAdapter(app.store).getReviews(source.targetStoreId, { country: app.country, lang: getCountry(app.country).lang, limit: 1 });
          latestReviewAt = newest ? new Date(newest.date) : null;
          report.checked++;
        } catch (err) {
          error = message(err).slice(0, 300);
          report.errors++;
        }
        const values = { ...source, checkedOn: date, error, ...(error ? {} : { latestReviewAt }) };
        await db
          .insert(schema.reviewFreshness)
          .values(values)
          // A failed check keeps the last good date and is not retried until tomorrow.
          .onConflictDoUpdate({ target: [schema.reviewFreshness.appId, schema.reviewFreshness.targetStoreId], set: values });
      }),
    ),
  );
  return report;
}

/** Newest review date of each source of one market, by target store id. */
export async function loadReviewFreshness(appId: number, targetStoreIds: string[]): Promise<Map<string, Date | null>> {
  if (targetStoreIds.length === 0) return new Map();
  const rows = await getDb()
    .select({ targetStoreId: schema.reviewFreshness.targetStoreId, latestReviewAt: schema.reviewFreshness.latestReviewAt })
    .from(schema.reviewFreshness)
    .where(and(eq(schema.reviewFreshness.appId, appId), inArray(schema.reviewFreshness.targetStoreId, targetStoreIds)));
  return new Map(rows.map((r) => [r.targetStoreId, r.latestReviewAt]));
}
