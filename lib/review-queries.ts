import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { shiftDate, today } from "./ranking";
import type { AppSummary } from "./stores/types";
import { latestPerKeyword, type VisibilitySnapshot, visibilityShare } from "./visibility";

/** Apps seen in the stored TOP 5 within this many days can have their reviews analysed. */
export const TOP5_DAYS = 30;
/** Competitors suggested in the empty state. */
export const SUGGESTED_TARGETS = 3;

export type ReviewTargetSource = "own" | "watched" | "top5" | "analysed";
export type ReviewTarget = {
  storeId: string;
  title: string;
  source: ReviewTargetSource;
  /** Store icon and rating when known (our listing, the watched competitor, or its TOP 5 entry). */
  icon?: string | null;
  rating?: number | null;
};

type AppRef = { id: number; store: "ios" | "android"; country: string; storeId: string; title: string; icon?: string; meta?: { rating?: number | null } };

/** The app as it appears in any stored TOP 5, newest first; null when it never did. */
export function findInTop5(snapshots: Pick<VisibilitySnapshot, "date" | "top5">[], storeId: string): AppSummary | null {
  const newest = [...snapshots].sort((a, b) => b.date.localeCompare(a.date));
  for (const s of newest) {
    const found = s.top5.find((a) => a.id === storeId);
    if (found) return found;
  }
  return null;
}

/** Other apps of the TOP 5 by visibility share (latest check per keyword), strongest first. */
export function topCompetitors(snapshots: VisibilitySnapshot[], popularity: Map<number, number | null>, ownStoreId: string, limit = SUGGESTED_TARGETS) {
  return visibilityShare(latestPerKeyword(snapshots), popularity)
    .filter((r) => r.app.id !== ownStoreId)
    .slice(0, limit);
}

async function recentSnapshots(appId: number) {
  return getDb()
    .select({ keywordId: schema.rankSnapshots.keywordId, date: schema.rankSnapshots.date, top5: schema.rankSnapshots.top5 })
    .from(schema.rankSnapshots)
    .where(and(eq(schema.rankSnapshots.appId, appId), gte(schema.rankSnapshots.date, shiftDate(today(), -TOP5_DAYS))));
}

/**
 * Who can be analysed from the Reseñas page: our app, the watched competitors, apps analysed before
 * and, among the apps of the TOP 5 of the last 30 days, the strongest by visibility share.
 */
export async function loadReviewTargets(app: AppRef) {
  const db = getDb();
  const [watched, analysed, snapshots] = await Promise.all([
    db
      .select({ storeId: schema.competitors.storeId, title: schema.competitors.title, icon: schema.competitors.icon, rating: schema.competitors.rating })
      .from(schema.competitors)
      .where(eq(schema.competitors.appId, app.id))
      .orderBy(schema.competitors.title),
    db
      .selectDistinct({ storeId: schema.reviewAnalyses.targetStoreId, title: schema.reviewAnalyses.targetTitle })
      .from(schema.reviewAnalyses)
      .where(eq(schema.reviewAnalyses.appId, app.id)),
    recentSnapshots(app.id),
  ]);
  const keywordIds = [...new Set(snapshots.map((s) => s.keywordId))];
  const metrics = keywordIds.length
    ? await db
        .select({ keywordId: schema.keywordMetrics.keywordId, popularity: schema.keywordMetrics.popularity })
        .from(schema.keywordMetrics)
        .where(
          and(
            inArray(schema.keywordMetrics.keywordId, keywordIds),
            eq(schema.keywordMetrics.store, app.store),
            eq(schema.keywordMetrics.country, app.country),
          ),
        )
    : [];
  const top = topCompetitors(snapshots, new Map(metrics.map((m) => [m.keywordId, m.popularity])), app.storeId);

  const targets: ReviewTarget[] = [{ storeId: app.storeId, title: app.title, source: "own", icon: app.icon ?? null, rating: app.meta?.rating ?? null }];
  const add = (t: ReviewTarget) => {
    if (!targets.some((x) => x.storeId === t.storeId)) targets.push(t);
  };
  for (const w of watched) add({ ...w, source: "watched" });
  for (const a of analysed) {
    const seen = findInTop5(snapshots, a.storeId);
    add({ ...a, source: "analysed", icon: seen?.icon ?? null, rating: seen?.rating ?? null });
  }
  return {
    targets,
    suggested: top.map((r) => ({ storeId: r.app.id, title: r.app.title, source: "top5" as const, share: r.share, icon: r.app.icon, rating: r.app.rating })),
    snapshots,
  };
}

/**
 * Checks on the server that a target may be analysed and returns its title: our app, a watched
 * competitor, one analysed before, or an app seen in this app's TOP 5 in the last 30 days.
 */
export async function resolveReviewTarget(app: AppRef, storeId: string): Promise<{ title: string; own: boolean } | null> {
  if (storeId === app.storeId) return { title: app.title, own: true };
  const db = getDb();
  const watched = await db.query.competitors.findFirst({
    where: and(eq(schema.competitors.appId, app.id), eq(schema.competitors.storeId, storeId)),
  });
  if (watched) return { title: watched.title, own: false };
  const fromTop5 = findInTop5(await recentSnapshots(app.id), storeId);
  if (fromTop5) return { title: fromTop5.title, own: false };
  const [before] = await db
    .select({ title: schema.reviewAnalyses.targetTitle })
    .from(schema.reviewAnalyses)
    .where(and(eq(schema.reviewAnalyses.appId, app.id), eq(schema.reviewAnalyses.targetStoreId, storeId)))
    .orderBy(desc(schema.reviewAnalyses.createdAt))
    .limit(1);
  return before ? { title: before.title, own: false } : null;
}
