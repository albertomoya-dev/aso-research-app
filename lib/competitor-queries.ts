import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { diffListings, type ListingChange } from "./listing-diff";
import { shiftDate, today } from "./ranking";
import { latestPerKeyword, shareByDay, visibilityShare } from "./visibility";

const SHARE_DAYS = 30;
const CHART_APPS = 5;

export type ChangeEvent = { competitorId: number; title: string; icon: string; date: Date; changes: ListingChange[] };

export async function getCompetitorPage(app: { id: number; store: "ios" | "android"; country: string; storeId: string; title: string }) {
  const db = getDb();
  const [snapshots, followed] = await Promise.all([
    db
      .select({ keywordId: schema.rankSnapshots.keywordId, date: schema.rankSnapshots.date, top5: schema.rankSnapshots.top5 })
      .from(schema.rankSnapshots)
      .where(and(eq(schema.rankSnapshots.appId, app.id), gte(schema.rankSnapshots.date, shiftDate(today(), -SHARE_DAYS))))
      .orderBy(asc(schema.rankSnapshots.date)),
    db.select().from(schema.competitors).where(eq(schema.competitors.appId, app.id)).orderBy(schema.competitors.title),
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
  const popularity = new Map(metrics.map((m) => [m.keywordId, m.popularity]));
  const current = visibilityShare(latestPerKeyword(snapshots), popularity);

  // Our app first, then the strongest others; colours follow this order.
  const own = current.find((r) => r.app.id === app.storeId);
  const others = current.filter((r) => r.app.id !== app.storeId).slice(0, CHART_APPS - 1);
  const series = [
    { id: app.storeId, title: own?.app.title ?? app.title, own: true },
    ...others.map((r) => ({ id: r.app.id, title: r.app.title, own: false })),
  ];
  const history = shareByDay(
    snapshots,
    popularity,
    series.map((s) => s.id),
  );

  const competitorIds = followed.map((c) => c.id);
  const listings = competitorIds.length
    ? await db
        .select()
        .from(schema.competitorSnapshots)
        .where(inArray(schema.competitorSnapshots.competitorId, competitorIds))
        .orderBy(asc(schema.competitorSnapshots.fetchedAt))
    : [];
  const changes: ChangeEvent[] = [];
  for (const [competitorId, rows] of Map.groupBy(listings, (l) => l.competitorId)) {
    const competitor = followed.find((c) => c.id === competitorId)!;
    for (let i = 1; i < rows.length; i++) {
      const diff = diffListings(rows[i - 1].listing, rows[i].listing);
      if (diff.length > 0) changes.push({ competitorId, title: competitor.title, icon: competitor.icon, date: rows[i].fetchedAt, changes: diff });
    }
  }
  changes.sort((a, b) => b.date.getTime() - a.date.getTime());

  return {
    keywordCount: keywordIds.length,
    current,
    series,
    history,
    followed,
    followedIds: new Set(followed.map((c) => c.storeId)),
    changes: changes.slice(0, 60),
  };
}
