import { and, eq, inArray } from "drizzle-orm";
import pLimit from "p-limit";
import { getDb, schema } from "@/db";
import { getCountry } from "./countries";
import { RELEVANCE_STOP_AT_MS, REVIEW_FRESHNESS_STOP_AT_MS } from "./cron-step";
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

/**
 * The sources still to check today, at most `max`: one never checked or checked on an earlier day.
 * Never-checked sources go first, then the ones checked longest ago, so with more than `max` sources the
 * cap rotates over all of them day after day instead of always reading the same first ones. Ties keep
 * the order of `sources`.
 */
export function sourcesToCheck(sources: FreshnessSource[], checked: CheckedRow[], date: string, max = MAX_FRESHNESS_SOURCES): FreshnessSource[] {
  const lastCheck = new Map(checked.map((c) => [`${c.appId}:${c.targetStoreId}`, c.checkedOn]));
  const seen = new Set<string>();
  const due: { source: FreshnessSource; checkedOn: string | null; index: number }[] = [];
  for (const s of sources) {
    const key = `${s.appId}:${s.targetStoreId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const checkedOn = lastCheck.get(key) ?? null;
    if (checkedOn !== null && checkedOn >= date) continue;
    due.push({ source: s, checkedOn, index: due.length });
  }
  due.sort((a, b) => {
    if (a.checkedOn !== b.checkedOn) {
      if (a.checkedOn === null) return -1;
      if (b.checkedOn === null) return 1;
      return a.checkedOn < b.checkedOn ? -1 : 1;
    }
    return a.index - b.index;
  });
  return due.slice(0, Math.max(0, max)).map((d) => d.source);
}

/**
 * The signal of one freshness request: it aborts when `requestDeadline` (epoch ms) comes, so a slow
 * store cannot eat the time of the relevance step that follows. Infinity: no signal (no limit).
 */
export function freshnessSignal(requestDeadline: number, now = Date.now()): AbortSignal | undefined {
  if (!Number.isFinite(requestDeadline)) return undefined;
  const left = requestDeadline - now;
  return left > 0 ? AbortSignal.timeout(left) : AbortSignal.abort(new DOMException("The review freshness step ran out of time.", "TimeoutError"));
}

export type FreshnessReport = { checked: number; skipped: number; errors: number };

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Daily step of the cron: for every market, the newest review date of each review source, read with one
 * store request (`limit: 1`) per source and day. Stops starting requests at `deadline` (epoch ms); what is
 * left is read the next day. A request still running at `requestDeadline` is abandoned (counted as an
 * error, retried the next day); by default that is when the cron starts the relevance step
 * (`RELEVANCE_STOP_AT_MS`, measured from the same start as `deadline`). Sources: our app, the watched
 * competitors and every app analysed before.
 */
export async function trackReviewFreshness(
  deadline = Infinity,
  requestDeadline = deadline + (RELEVANCE_STOP_AT_MS - REVIEW_FRESHNESS_STOP_AT_MS),
): Promise<FreshnessReport> {
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
          const [newest] = await getAdapter(app.store).getReviews(source.targetStoreId, {
            country: app.country,
            lang: getCountry(app.country).lang,
            limit: 1,
            signal: freshnessSignal(requestDeadline),
          });
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
