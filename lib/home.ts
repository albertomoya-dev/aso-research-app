import { and, asc, eq, gte, sql } from "drizzle-orm";
import { cache } from "react";
import { getDb, schema } from "@/db";
import type { App } from "@/db/schema";
import { pickBaseline, summarizeWeek, type WeekSummary } from "./alerts";
import { getCountry } from "./countries";
import type { HealthItem, HealthStatus, NextSeason } from "./health";
import { loadHealthDetail } from "./health-queries";
import { opportunityScore } from "./popularity";
import { getKeywordRows, type KeywordRow } from "./queries";
import { shiftDate, today } from "./ranking";
import { isRelevantKeyword, type KeywordIntent, type RelevanceSource } from "./relevance";
import { relevanceFactor } from "./suggestions";
import { POSITION_WEIGHT } from "./visibility";

// Inicio (all apps) and the weekly figures of a market's Resumen. The pure helpers come first and are
// tested; `getHomeOverview` reads everything for every market in one round of three queries.

/** Days of the visibility sparkline (and of the snapshots read for the week-on-week changes). */
export const HOME_DAYS = 30;
/** How many keywords the «posición media» of a market is measured on. */
export const TOP_KEYWORDS = 5;

/** A check reduced to what the home page needs; `slots` is how many apps its TOP 5 holds (0–5). */
export type HomeSnapshot = { keywordId: number; date: string; position: number | null; depth: number; slots: number };

/**
 * Own share of the weighted TOP 5 slots (0–100), the figure `visibilityShare` gives for our app, computed
 * from our position alone: a keyword is worth its popularity (1 when unknown) and its TOP 5 splits that
 * worth by POSITION_WEIGHT, so the total is worth × the weights of the slots it holds and our part is
 * worth × the weight of our position when we are in it. Null without snapshots.
 */
export function ownShare(snapshots: Pick<HomeSnapshot, "keywordId" | "position" | "slots">[], popularity: Map<number, number | null>): number | null {
  if (snapshots.length === 0) return null;
  let total = 0;
  let own = 0;
  for (const s of snapshots) {
    const worth = Math.max(1, popularity.get(s.keywordId) ?? 1);
    const slots = Math.min(s.slots, POSITION_WEIGHT.length);
    for (let i = 0; i < slots; i++) total += worth * POSITION_WEIGHT[i];
    if (s.position != null && s.position >= 1 && s.position <= slots) own += worth * POSITION_WEIGHT[s.position - 1];
  }
  return total ? (100 * own) / total : 0;
}

/** Own share on each of the `days` days up to `until` (oldest first), 1 decimal; null on days without checks. */
export function ownShareSeries(snapshots: HomeSnapshot[], popularity: Map<number, number | null>, until: string, days = HOME_DAYS): (number | null)[] {
  const byDay = Map.groupBy(snapshots, (s) => s.date);
  const out: (number | null)[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const share = ownShare(byDay.get(shiftDate(until, -i)) ?? [], popularity);
    out.push(share == null ? null : Math.round(share * 10) / 10);
  }
  return out;
}

export type MarketWeek<T> = {
  week: WeekSummary;
  /** The check compared against (see `pickBaseline`); null with a single day of data. */
  baselineDate: string | null;
  /** Latest check of each keyword, and the latest on or before the baseline. */
  now: T[];
  before: T[];
  /**
   * Week-on-week change of the TOP 10 and TOP 30 counts over the keywords checked on both dates, so a
   * keyword added this week does not read as a gain. Null without a baseline.
   */
  top10Change: number | null;
  top30Change: number | null;
};

/**
 * One market's week from its snapshots (any order): latest check of each keyword against the one of a
 * week before `until` (or the oldest one when the market is newer), the same rule as the weekly summary.
 */
export function marketWeek<T extends { keywordId: number; date: string; position: number | null; depth: number | null; term?: string }>(
  snapshots: T[],
  until: string,
): MarketWeek<T> {
  const since = shiftDate(until, -7);
  const baselineDate = pickBaseline(
    snapshots.map((s) => s.date),
    since,
  );
  const latest = (list: T[]) => {
    const by = new Map<number, T>();
    for (const s of list) {
      const cur = by.get(s.keywordId);
      if (!cur || s.date > cur.date) by.set(s.keywordId, s);
    }
    return [...by.values()];
  };
  const before = baselineDate ? latest(snapshots.filter((s) => s.date <= baselineDate)) : [];
  const now = latest(baselineDate ? snapshots.filter((s) => s.date > baselineDate) : snapshots);
  const beforeBy = new Map(before.map((r) => [r.keywordId, r]));
  const rows = now.map((r) => {
    const b = beforeBy.get(r.keywordId);
    return {
      keywordId: r.keywordId,
      term: r.term ?? "",
      now: r.position,
      nowDepth: r.depth,
      before: b?.position ?? null,
      beforeDepth: b?.depth ?? null,
      hasBefore: b != null,
    };
  });
  const week = summarizeWeek(rows);
  const both = rows.filter((r) => r.hasBefore);
  const count = (max: number, pick: (r: (typeof rows)[number]) => number | null) => both.filter((r) => pick(r) != null && pick(r)! <= max).length;
  return {
    week,
    baselineDate,
    now,
    before,
    top10Change: baselineDate ? count(10, (r) => r.now) - count(10, (r) => r.before) : null,
    top30Change: baselineDate ? count(30, (r) => r.now) - count(30, (r) => r.before) : null,
  };
}

/** The checks inside keyword rows (`getKeywordRows`), flattened for `marketWeek`. */
export function rowSnapshots(rows: Pick<KeywordRow, "id" | "term" | "history">[]) {
  return rows.flatMap((r) => r.history.map((h) => ({ keywordId: r.id, term: r.term, date: h.date, position: h.position, depth: h.depth })));
}

/**
 * Own share in a daily series (`shareByDay`): the latest day, and the day the week is compared against
 * (`pickBaseline`). Null when the series has no day, or no baseline.
 */
export function shareWeek(points: Record<string, number | string>[], ownId: string, until: string): { now: number | null; before: number | null } {
  if (points.length === 0) return { now: null, before: null };
  const value = (p: Record<string, number | string> | undefined) => (p ? Number(p[ownId]) || 0 : null);
  const baseline = pickBaseline(
    points.map((p) => String(p.date)),
    shiftDate(until, -7),
  );
  return { now: value(points.at(-1)), before: baseline ? value(points.find((p) => p.date === baseline)) : null };
}

export type RankedKeyword = {
  keywordId: number;
  term: string;
  relevance: number | null;
  relevanceSource?: RelevanceSource | null;
  intent: KeywordIntent | null;
  opportunity: number | null;
  /** Latest position; null when outside the results or never checked. */
  position: number | null;
};

/**
 * «Posición media de las 5 principales»: the `n` relevant keywords with the most opportunity (unknown
 * opportunity last), and the mean position of those that rank. Outside the results is unknown, not
 * «position 31», so it is left out of the mean and reported through `known`.
 */
export function topKeywordsPosition(keywords: RankedKeyword[], lang: string, n = TOP_KEYWORDS): { mean: number | null; known: number; count: number } {
  const top = keywords
    .filter((k) => isRelevantKeyword(k, lang))
    .sort((a, b) => (b.opportunity ?? -1) - (a.opportunity ?? -1) || a.term.localeCompare(b.term))
    .slice(0, n);
  const ranked = top.filter((k) => k.position != null);
  return {
    mean: ranked.length ? Math.round((10 * ranked.reduce((s, k) => s + k.position!, 0)) / ranked.length) / 10 : null,
    known: ranked.length,
    count: top.length,
  };
}

export type HomeMarket = {
  /** The market row (with the listing and its product slug, for `marketPath`): health is loaded from it. */
  app: App & { productSlug: string };
  productSlug: string;
  productTitle: string;
  productIcon: string;
  /** Own share of the TOP 5 now and a week ago (0–100); null without data. */
  share: number | null;
  shareBefore: number | null;
  /** Daily own share of the last HOME_DAYS days, oldest first. */
  spark: (number | null)[];
  tracked: number;
  top10: number;
  top10Change: number | null;
  top30: number;
  top30Change: number | null;
  topPosition: { mean: number | null; known: number; count: number };
  rating: number | null;
  ratingsCount: number | null;
  unread: number;
  lastCheck: string | null;
};

export type HomeKpis = {
  top10: number;
  top10Change: number | null;
  top30: number;
  top30Change: number | null;
  /** Mean own share of the markets with data, and its change in points over the markets with both. */
  share: number | null;
  shareChange: number | null;
  unread: number;
  /** Markets with unread alerts. */
  unreadMarkets: number;
};

/** The KPI strip from the market rows: sums, and the changes only over the markets that have a week to compare. */
export function homeKpis(markets: Pick<HomeMarket, "top10" | "top10Change" | "top30" | "top30Change" | "share" | "shareBefore" | "unread">[]): HomeKpis {
  const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
  const changes = (pick: (m: (typeof markets)[number]) => number | null) => {
    const known = markets.map(pick).filter((x): x is number => x != null);
    return known.length ? sum(known) : null;
  };
  const withShare = markets.filter((m) => m.share != null);
  const withBoth = withShare.filter((m) => m.shareBefore != null);
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return {
    top10: sum(markets.map((m) => m.top10)),
    top10Change: changes((m) => m.top10Change),
    top30: sum(markets.map((m) => m.top30)),
    top30Change: changes((m) => m.top30Change),
    share: withShare.length ? round1(sum(withShare.map((m) => m.share!)) / withShare.length) : null,
    shareChange: withBoth.length ? round1(sum(withBoth.map((m) => m.share! - m.shareBefore!)) / withBoth.length) : null,
    unread: sum(markets.map((m) => m.unread)),
    unreadMarkets: markets.filter((m) => m.unread > 0).length,
  };
}

/**
 * Inicio: one row per followed market and the KPIs of all of them. One round of three queries for every
 * market (markets, the last HOME_DAYS days of checks of the tracked keywords, and the keywords with their
 * metrics), never one per app. Health is apart (`marketHealth`), streamed per row. Cached per request:
 * the page and «Qué hacer hoy» share one load (and the same `app` objects, which key `marketHealth`).
 */
export const getHomeOverview = cache(async (): Promise<{ markets: HomeMarket[]; kpis: HomeKpis; until: string; ms: number }> => {
  const started = performance.now();
  const db = getDb();
  const until = today();
  const since = shiftDate(until, -HOME_DAYS);
  const a = schema.apps;
  const [markets, snapshots, keywords] = await Promise.all([
    db
      .select({
        app: a,
        productSlug: schema.products.slug,
        productTitle: schema.products.title,
        productIcon: schema.products.icon,
        unread: sql<number>`(select count(*) from ${schema.alerts} al where al.app_id = ${a.id} and al.read_at is null)`.mapWith(Number),
      })
      .from(a)
      .innerJoin(schema.products, eq(schema.products.id, a.productId))
      .orderBy(asc(schema.products.title), asc(schema.products.id), asc(a.id)),
    db
      .select({
        appId: schema.rankSnapshots.appId,
        keywordId: schema.rankSnapshots.keywordId,
        date: schema.rankSnapshots.date,
        position: schema.rankSnapshots.position,
        depth: schema.rankSnapshots.depth,
        // Only the size of the TOP 5 is needed, not the five apps.
        slots: sql<number>`least(coalesce(jsonb_array_length(${schema.rankSnapshots.top5}), 0), 5)`.mapWith(Number),
      })
      .from(schema.rankSnapshots)
      .innerJoin(
        schema.appKeywords,
        and(eq(schema.appKeywords.appId, schema.rankSnapshots.appId), eq(schema.appKeywords.keywordId, schema.rankSnapshots.keywordId)),
      )
      .where(gte(schema.rankSnapshots.date, since)),
    db
      .select({
        appId: schema.appKeywords.appId,
        keywordId: schema.appKeywords.keywordId,
        term: schema.keywords.term,
        relevance: schema.appKeywords.relevance,
        relevanceSource: schema.appKeywords.relevanceSource,
        intent: schema.appKeywords.intent,
        popularity: schema.keywordMetrics.popularity,
        difficulty: schema.keywordMetrics.difficulty,
      })
      .from(schema.appKeywords)
      .innerJoin(schema.keywords, eq(schema.keywords.id, schema.appKeywords.keywordId))
      .innerJoin(a, eq(a.id, schema.appKeywords.appId))
      .leftJoin(
        schema.keywordMetrics,
        and(
          eq(schema.keywordMetrics.keywordId, schema.appKeywords.keywordId),
          eq(schema.keywordMetrics.store, a.store),
          eq(schema.keywordMetrics.country, a.country),
        ),
      ),
  ]);

  const snapsBy = Map.groupBy(snapshots, (s) => s.appId);
  const keywordsBy = Map.groupBy(keywords, (k) => k.appId);
  const rows: HomeMarket[] = markets.map(({ app, productSlug, productTitle, productIcon, unread }) => {
    const snaps = snapsBy.get(app.id) ?? [];
    const kws = keywordsBy.get(app.id) ?? [];
    const popularity = new Map(kws.map((k) => [k.keywordId, k.popularity]));
    const w = marketWeek(snaps, until);
    const latestBy = new Map(w.now.map((s) => [s.keywordId, s]));
    // `now` excludes the baseline day; a keyword checked only up to then still has a latest position.
    for (const s of w.before) if (!latestBy.has(s.keywordId)) latestBy.set(s.keywordId, s);
    const ranked: RankedKeyword[] = kws.map((k) => ({
      keywordId: k.keywordId,
      term: k.term,
      relevance: k.relevance,
      relevanceSource: k.relevanceSource,
      intent: k.intent,
      opportunity: k.popularity != null && k.difficulty != null ? opportunityScore(k.popularity, k.difficulty, relevanceFactor(k.relevance)) : null,
      position: latestBy.get(k.keywordId)?.position ?? null,
    }));
    const latest = [...latestBy.values()];
    return {
      app: { ...app, productSlug },
      productSlug,
      productTitle,
      productIcon,
      share: ownShare(latest, popularity),
      shareBefore: w.baselineDate ? ownShare(w.before, popularity) : null,
      spark: ownShareSeries(snaps, popularity, until),
      tracked: kws.length,
      top10: latest.filter((s) => s.position != null && s.position <= 10).length,
      top10Change: w.top10Change,
      top30: latest.filter((s) => s.position != null && s.position <= 30).length,
      top30Change: w.top30Change,
      topPosition: topKeywordsPosition(ranked, getCountry(app.country).lang),
      rating: app.meta.rating ?? null,
      ratingsCount: app.meta.ratingsCount ?? null,
      unread,
      lastCheck: snaps.reduce<string | null>((m, s) => (m == null || s.date > m ? s.date : m), null),
    };
  });
  const ms = Math.round(performance.now() - started);
  if (process.env.LOG_TIMING) console.info(`[inicio] getHomeOverview: ${rows.length} mercados, ${snapshots.length} posiciones, 3 consultas, ${ms} ms`);
  return { markets: rows, kpis: homeKpis(rows), until, ms };
});

const STEP_ORDER: Record<HealthStatus, number> = { bad: 0, warn: 1, unknown: 2, good: 3 };

/**
 * «Próximos pasos» of the Resumen: the health lines to act on, worst first (then «sin datos» ones that
 * have something to do), and the rest folded in «N en orden».
 */
export function sortSteps(items: HealthItem[]): { tasks: HealthItem[]; fine: HealthItem[]; noData: HealthItem[] } {
  const sorted = [...items].sort((a, b) => STEP_ORDER[a.status] - STEP_ORDER[b.status]);
  const actionable = (i: HealthItem) => Boolean(i.href && i.action);
  return {
    tasks: sorted.filter((i) => i.status === "bad" || i.status === "warn" || (i.status === "unknown" && actionable(i))),
    fine: sorted.filter((i) => i.status === "good"),
    noData: sorted.filter((i) => i.status === "unknown" && !actionable(i)),
  };
}

/**
 * «MyTherapy 33 % · Medisafe 15 % · Tú 3 %»: the `others` strongest apps and you (last), from the current
 * share (`visibilityShare`), and what is left for the rest of the TOP 5.
 */
export function competitionLine(current: { app: { id: string; title: string }; share: number }[], ownId: string, others = 3) {
  const own = current.find((r) => r.app.id === ownId);
  const top = current.filter((r) => r.app.id !== ownId).slice(0, others);
  const shown = [
    ...top.map((r) => ({ id: r.app.id, title: r.app.title, share: r.share, own: false })),
    { id: ownId, title: "Tú", share: own?.share ?? 0, own: true },
  ];
  const rest = Math.max(0, 100 - shown.reduce((s, r) => s + r.share, 0));
  return { shown, rest };
}

/** `getKeywordRows`, cached per request: the Resumen's sections and its health share one load. */
export const marketRows = cache((app: App) => getKeywordRows(app));

export type MarketHealth ={ items: HealthItem[]; seasons: NextSeason[]; rows: KeywordRow[] };

/**
 * Health of one market without calling the stores (the reviews line, which asks Google Play, is left
 * out): its keyword rows and `loadHealthDetail`. Cached per request, so the row's dots on Inicio and
 * «Qué hacer hoy» share one load.
 */
export const marketHealth = cache(async (app: App & { productSlug: string }): Promise<MarketHealth> => {
  const rows = await marketRows(app);
  const { items, seasons } = await loadHealthDetail(app, rows);
  return { items, seasons, rows };
});
