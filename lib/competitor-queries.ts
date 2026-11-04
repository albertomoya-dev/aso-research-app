import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { chartSeries, seriesColor, type SharedKeyword, sharedKeywords } from "./competitor-view";
import { diffListings, type Listing, type ListingChange } from "./listing-diff";
import { shiftDate, today } from "./ranking";
import { latestPerKeyword, shareByDay, visibilityShare } from "./visibility";

const SHARE_DAYS = 30;
const CHART_APPS = 5;

export type ChangeEvent = { competitorId: number; title: string; icon: string; date: Date; changes: ListingChange[] };

/** Store ids of the competitors the user watches for this app, to highlight them in the TOP 5 column. */
export async function watchedStoreIds(appId: number): Promise<Set<string>> {
  const rows = await getDb().select({ storeId: schema.competitors.storeId }).from(schema.competitors).where(eq(schema.competitors.appId, appId));
  return new Set(rows.map((r) => r.storeId));
}

/** Ranges of the visibility charts (Resumen offers all three; Competidores uses the first). */
export const SHARE_RANGES = [30, 90, 180] as const;
export type ShareDays = (typeof SHARE_RANGES)[number];

type ShareApp = { id: number; store: "ios" | "android"; country: string; storeId: string; title: string };

/**
 * Visibility share of the last `days` days: the current share of every app (latest check of each keyword),
 * the series to draw (our app first, then the strongest others) and the share per day. Two queries.
 */
export async function getShareHistory(app: ShareApp, days: ShareDays = SHARE_DAYS) {
  const db = getDb();
  const snapshots = await db
    .select({ keywordId: schema.rankSnapshots.keywordId, date: schema.rankSnapshots.date, top5: schema.rankSnapshots.top5 })
    .from(schema.rankSnapshots)
    .where(and(eq(schema.rankSnapshots.appId, app.id), gte(schema.rankSnapshots.date, shiftDate(today(), -days))))
    .orderBy(asc(schema.rankSnapshots.date));
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
  const latest = latestPerKeyword(snapshots);
  const current = visibilityShare(latest, popularity);

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
  return { keywordCount: keywordIds.length, current, series, history, latest };
}

/** Rows of the competitor table, at most: the strongest apps of the TOP 5 plus every watched one. */
const TABLE_APPS = 25;
const DESCRIPTION_CHARS = 600;

export type CompetitorRow = {
  storeId: string;
  title: string;
  developer: string;
  icon: string;
  url: string;
  own: boolean;
  /** 0–100; 0 for a watched app not in any TOP 5 now. */
  share: number;
  keywords: number;
  bestPosition: number | null;
  rating: number | null;
  /** Its row in `competitors` when watched. */
  competitorId: number | null;
  /** Colour of its series in the chart, when it has one. */
  color: string | null;
};

export type CompetitorDetail = {
  ratingsCount: number | null;
  checkedAt: Date | null;
  error: string | null;
  listing: { shortDescription: string; description: string; version: string | null; category: string | null; screenshots: number } | null;
  changes: ChangeEvent[];
  shared: SharedKeyword[];
};

export async function getCompetitorPage(app: ShareApp, opts: { days?: ShareDays } = {}) {
  const db = getDb();
  const [share, followed] = await Promise.all([
    getShareHistory(app, opts.days),
    db.select().from(schema.competitors).where(eq(schema.competitors.appId, app.id)).orderBy(schema.competitors.title),
  ]);
  const { keywordCount, current, series, history, latest } = share;

  const competitorIds = followed.map((c) => c.id);
  const latestIds = latest.map((l) => l.keywordId);
  const [listings, terms] = await Promise.all([
    competitorIds.length
      ? db
          .select()
          .from(schema.competitorSnapshots)
          .where(inArray(schema.competitorSnapshots.competitorId, competitorIds))
          .orderBy(asc(schema.competitorSnapshots.fetchedAt))
      : [],
    latestIds.length
      ? db.select({ id: schema.keywords.id, term: schema.keywords.term }).from(schema.keywords).where(inArray(schema.keywords.id, latestIds))
      : [],
  ]);
  const changes: ChangeEvent[] = [];
  const lastListing = new Map<number, Listing>();
  for (const [competitorId, rows] of Map.groupBy(listings, (l) => l.competitorId)) {
    const competitor = followed.find((c) => c.id === competitorId)!;
    lastListing.set(competitorId, rows.at(-1)!.listing);
    for (let i = 1; i < rows.length; i++) {
      const diff = diffListings(rows[i - 1].listing, rows[i].listing);
      if (diff.length > 0) changes.push({ competitorId, title: competitor.title, icon: competitor.icon, date: rows[i].fetchedAt, changes: diff });
    }
  }
  changes.sort((a, b) => b.date.getTime() - a.date.getTime());

  const plotted = chartSeries(series, history).series;
  const colorOf = new Map(plotted.map((s, i) => [s.id, seriesColor(s, i)]));
  const watchedBy = new Map(followed.map((c) => [c.storeId, c]));
  const rows: CompetitorRow[] = current.slice(0, TABLE_APPS).map((r) => ({
    storeId: r.app.id,
    title: r.app.title,
    developer: r.app.developer,
    icon: r.app.icon,
    url: r.app.url,
    own: r.app.id === app.storeId,
    share: r.share,
    keywords: r.keywords,
    bestPosition: r.bestPosition,
    rating: watchedBy.get(r.app.id)?.rating ?? r.app.rating ?? null,
    competitorId: watchedBy.get(r.app.id)?.id ?? null,
    color: colorOf.get(r.app.id) ?? null,
  }));
  // Watched apps out of the TOP 5 (or past the first rows) still get a row, to see and unwatch them.
  for (const c of followed) {
    if (rows.some((r) => r.storeId === c.storeId)) continue;
    const r = current.find((x) => x.app.id === c.storeId);
    rows.push({
      storeId: c.storeId,
      title: c.title,
      developer: c.developer,
      icon: c.icon,
      url: c.url,
      own: false,
      share: r?.share ?? 0,
      keywords: r?.keywords ?? 0,
      bestPosition: r?.bestPosition ?? null,
      rating: c.rating,
      competitorId: c.id,
      color: colorOf.get(c.storeId) ?? null,
    });
  }

  const shared = sharedKeywords(latest, new Map(terms.map((t) => [t.id, t.term])), app.storeId);
  const details: Record<string, CompetitorDetail> = {};
  for (const row of rows) {
    if (row.own) continue;
    const c = watchedBy.get(row.storeId);
    const listing = c ? lastListing.get(c.id) : undefined;
    details[row.storeId] = {
      ratingsCount: c?.ratingsCount ?? null,
      checkedAt: c?.checkedAt ?? null,
      error: c?.error ?? null,
      listing: listing
        ? {
            shortDescription: listing.shortDescription ?? "",
            description: (listing.description ?? "").slice(0, DESCRIPTION_CHARS),
            version: listing.version ?? null,
            category: listing.category ?? null,
            screenshots: listing.screenshots?.length ?? 0,
          }
        : null,
      changes: c ? changes.filter((e) => e.competitorId === c.id).slice(0, 20) : [],
      shared: shared.get(row.storeId) ?? [],
    };
  }

  return {
    keywordCount,
    current,
    series,
    history,
    rows,
    details,
    followed,
    followedIds: new Set(followed.map((c) => c.storeId)),
    changes: changes.slice(0, 60),
  };
}
