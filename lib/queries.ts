import { and, asc, desc, eq, gte } from "drizzle-orm";
import { getDb, schema } from "@/db";
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
};

const SPARK_DAYS = 30;

/** Keywords of an app with their latest position, changes and the last 30 days. */
export async function getKeywordRows(appId: number): Promise<KeywordRow[]> {
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
    };
  });
}

/** Days on each side of an annotation used to compare the average position. */
export const ANNOTATION_WINDOW = 14;

export async function getKeywordDetail(appId: number, keywordId: number, days: number) {
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
  return {
    keyword,
    since,
    /** Includes the window before `since`; filter by `since` for the chart. */
    history: snapshots.map(({ date, position }) => ({ date, position })),
    latest: snapshots.at(-1) ?? null,
    annotations,
  };
}
