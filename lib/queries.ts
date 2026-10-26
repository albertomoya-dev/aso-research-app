import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { opportunityScore } from "./popularity";
import { positionChange, shiftDate, today } from "./ranking";
import type { AppSummary } from "./stores/types";

export type HistoryPoint = { date: string; position: number | null };

export type KeywordRow = {
  id: number;
  term: string;
  source: "manual" | "ai" | "autocomplete";
  position: number | null;
  /** Date of the latest snapshot; null when the keyword was never tracked. */
  checkedOn: string | null;
  depth: number | null;
  changeDay: number | null;
  changeWeek: number | null;
  history: HistoryPoint[];
  leader: AppSummary | null;
  popularity: number | null;
  difficulty: number | null;
  opportunity: number | null;
};

export type KeywordMetrics = { popularity: number | null; difficulty: number | null; prefixLength: number | null };

function withOpportunity(m: KeywordMetrics | undefined) {
  const popularity = m?.popularity ?? null;
  const difficulty = m?.difficulty ?? null;
  return {
    popularity,
    difficulty,
    opportunity: popularity != null && difficulty != null ? opportunityScore(popularity, difficulty) : null,
  };
}

async function metricsFor(keywordIds: number[], store: "ios" | "android", country: string) {
  if (keywordIds.length === 0) return new Map<number, KeywordMetrics>();
  const rows = await getDb()
    .select({
      keywordId: schema.keywordMetrics.keywordId,
      popularity: schema.keywordMetrics.popularity,
      difficulty: schema.keywordMetrics.difficulty,
      prefixLength: schema.keywordMetrics.prefixLength,
    })
    .from(schema.keywordMetrics)
    .where(
      and(
        inArray(schema.keywordMetrics.keywordId, keywordIds),
        eq(schema.keywordMetrics.store, store),
        eq(schema.keywordMetrics.country, country),
      ),
    );
  return new Map(rows.map(({ keywordId, ...m }) => [keywordId, m]));
}

const SPARK_DAYS = 30;

/** Keywords of an app with their latest position, changes and the last 30 days. */
export async function getKeywordRows(app: { id: number; store: "ios" | "android"; country: string }): Promise<KeywordRow[]> {
  const appId = app.id;
  const db = getDb();
  const since = shiftDate(today(), -SPARK_DAYS);
  const [keywords, snapshots] = await Promise.all([
    db
      .select({ id: schema.keywords.id, term: schema.keywords.term, source: schema.appKeywords.source })
      .from(schema.appKeywords)
      .innerJoin(schema.keywords, eq(schema.keywords.id, schema.appKeywords.keywordId))
      .where(eq(schema.appKeywords.appId, appId))
      .orderBy(schema.keywords.term),
    db
      .select({
        keywordId: schema.rankSnapshots.keywordId,
        date: schema.rankSnapshots.date,
        position: schema.rankSnapshots.position,
        depth: schema.rankSnapshots.depth,
        top5: schema.rankSnapshots.top5,
      })
      .from(schema.rankSnapshots)
      .where(and(eq(schema.rankSnapshots.appId, appId), gte(schema.rankSnapshots.date, since)))
      .orderBy(asc(schema.rankSnapshots.date)),
  ]);

  const byKeyword = Map.groupBy(snapshots, (s) => s.keywordId);
  const metrics = await metricsFor(
    keywords.map((k) => k.id),
    app.store,
    app.country,
  );
  return keywords.map((k) => {
    const history = byKeyword.get(k.id) ?? [];
    const latest = history.at(-1);
    const on = (date: string) => history.find((h) => h.date === date)?.position;
    return {
      ...k,
      position: latest?.position ?? null,
      checkedOn: latest?.date ?? null,
      depth: latest?.depth ?? null,
      changeDay: latest ? positionChange(latest.position, on(shiftDate(latest.date, -1))) : null,
      changeWeek: latest ? positionChange(latest.position, on(shiftDate(latest.date, -7))) : null,
      history: history.map(({ date, position }) => ({ date, position })),
      leader: latest?.top5[0] ?? null,
      ...withOpportunity(metrics.get(k.id)),
    };
  });
}

/** Days on each side of an annotation used to compare the average position. */
export const ANNOTATION_WINDOW = 14;

export async function getKeywordDetail(
  app: { id: number; store: "ios" | "android"; country: string },
  keywordId: number,
  days: number,
) {
  const appId = app.id;
  const db = getDb();
  const since = shiftDate(today(), -days);
  // Annotations near the start of the range need the days before it for their comparison.
  const historySince = shiftDate(since, -ANNOTATION_WINDOW);
  const [keyword, snapshots, annotations] = await Promise.all([
    db
      .select({ id: schema.keywords.id, term: schema.keywords.term })
      .from(schema.appKeywords)
      .innerJoin(schema.keywords, eq(schema.keywords.id, schema.appKeywords.keywordId))
      .where(and(eq(schema.appKeywords.appId, appId), eq(schema.appKeywords.keywordId, keywordId)))
      .then((rows) => rows[0]),
    db
      .select({
        date: schema.rankSnapshots.date,
        position: schema.rankSnapshots.position,
        depth: schema.rankSnapshots.depth,
        top5: schema.rankSnapshots.top5,
      })
      .from(schema.rankSnapshots)
      .where(
        and(
          eq(schema.rankSnapshots.appId, appId),
          eq(schema.rankSnapshots.keywordId, keywordId),
          gte(schema.rankSnapshots.date, historySince),
        ),
      )
      .orderBy(asc(schema.rankSnapshots.date)),
    db
      .select()
      .from(schema.annotations)
      .where(and(eq(schema.annotations.appId, appId), gte(schema.annotations.date, since)))
      .orderBy(desc(schema.annotations.date)),
  ]);
  if (!keyword) return null;
  const [metrics, trend] = await Promise.all([
    metricsFor([keywordId], app.store, app.country).then((m) => m.get(keywordId)),
    db
      .select({ points: schema.keywordTrends.points, error: schema.keywordTrends.error, fetchedAt: schema.keywordTrends.fetchedAt })
      .from(schema.keywordTrends)
      .where(and(eq(schema.keywordTrends.keywordId, keywordId), eq(schema.keywordTrends.country, app.country)))
      .then((rows) => rows[0] ?? null),
  ]);
  return {
    keyword,
    since,
    /** Includes the window before `since`; filter by `since` for the chart. */
    history: snapshots.map(({ date, position }) => ({ date, position })),
    latest: snapshots.at(-1) ?? null,
    annotations,
    metrics: { ...withOpportunity(metrics), prefixLength: metrics?.prefixLength ?? null },
    trend,
  };
}
