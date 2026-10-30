import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { pickBaseline, summarizeWeek, type WeekSummary } from "./alerts";
import { shiftDate, today } from "./ranking";
import { latestPerKeyword, visibilityShare } from "./visibility";

export type AppWeek = {
  app: { id: number; title: string; icon: string; store: "ios" | "android"; country: string };
  week: WeekSummary;
  /** The check compared against: a week ago, or the oldest one when the app is newer. Null with a single day of data. */
  baselineDate: string | null;
  /** Own share of the TOP 5 now and on the baseline date, 0–100; null without data. */
  share: number | null;
  shareBefore: number | null;
  alerts: { title: string; detail: string; tone: string; date: string }[];
};

/**
 * For every followed app: the latest check of each keyword against the one from a week before,
 * or against the oldest check when the app started being followed less than a week ago.
 */
export async function getWeeklySummaries(): Promise<{ since: string; until: string; apps: AppWeek[] }> {
  const db = getDb();
  const until = today();
  const since = shiftDate(until, -7);
  // Extra days so a keyword not checked exactly a week ago still has a "before".
  const from = shiftDate(since, -7);
  const [apps, snapshots, alerts] = await Promise.all([
    db.select().from(schema.apps).orderBy(schema.apps.title),
    db
      .select({
        appId: schema.rankSnapshots.appId,
        keywordId: schema.rankSnapshots.keywordId,
        term: schema.keywords.term,
        date: schema.rankSnapshots.date,
        position: schema.rankSnapshots.position,
        depth: schema.rankSnapshots.depth,
        top5: schema.rankSnapshots.top5,
      })
      .from(schema.rankSnapshots)
      .innerJoin(schema.keywords, eq(schema.keywords.id, schema.rankSnapshots.keywordId))
      .innerJoin(
        schema.appKeywords,
        and(eq(schema.appKeywords.appId, schema.rankSnapshots.appId), eq(schema.appKeywords.keywordId, schema.rankSnapshots.keywordId)),
      )
      .where(gte(schema.rankSnapshots.date, from))
      .orderBy(asc(schema.rankSnapshots.date)),
    db
      .select()
      .from(schema.alerts)
      .where(gte(schema.alerts.date, since))
      .orderBy(asc(schema.alerts.date)),
  ]);
  const keywordIds = [...new Set(snapshots.map((s) => s.keywordId))];
  const metrics = keywordIds.length
    ? await db
        .select({
          keywordId: schema.keywordMetrics.keywordId,
          store: schema.keywordMetrics.store,
          country: schema.keywordMetrics.country,
          popularity: schema.keywordMetrics.popularity,
        })
        .from(schema.keywordMetrics)
        .where(inArray(schema.keywordMetrics.keywordId, keywordIds))
    : [];

  const result: AppWeek[] = apps.map((app) => {
    const rows = snapshots.filter((s) => s.appId === app.id);
    const baselineDate = pickBaseline(
      rows.map((r) => r.date),
      since,
    );
    const before = baselineDate ? latestPerKeyword(rows.filter((r) => r.date <= baselineDate)) : [];
    const now = latestPerKeyword(baselineDate ? rows.filter((r) => r.date > baselineDate) : rows);
    const beforeBy = new Map(before.map((r) => [r.keywordId, r]));
    const week = summarizeWeek(
      now.map((r) => {
        const b = beforeBy.get(r.keywordId);
        return {
          keywordId: r.keywordId,
          term: r.term,
          now: r.position,
          nowDepth: r.depth,
          before: b?.position ?? null,
          beforeDepth: b?.depth ?? null,
          hasBefore: b != null,
        };
      }),
    );
    const popularity = new Map(
      metrics.filter((m) => m.store === app.store && m.country === app.country).map((m) => [m.keywordId, m.popularity]),
    );
    const shareOf = (snaps: typeof before) =>
      snaps.length ? (visibilityShare(snaps, popularity).find((r) => r.app.id === app.storeId)?.share ?? 0) : null;
    return {
      app: { id: app.id, title: app.title, icon: app.icon, store: app.store, country: app.country },
      week,
      baselineDate,
      share: shareOf(now),
      shareBefore: shareOf(before),
      alerts: alerts
        .filter((a) => a.appId === app.id)
        .map((a) => ({ title: a.title, detail: a.detail, tone: a.tone, date: a.date })),
    };
  });
  return { since, until, apps: result };
}
