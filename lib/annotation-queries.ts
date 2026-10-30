import { and, asc, desc, eq, gte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Annotation, Experiment } from "@/db/schema";
import { affectedKeywords } from "./annotations";
import { annotationImpact, IMPACT_WINDOW, type Impact, type ImpactPoint, type ImpactVerdict, summarizeImpacts } from "./impact";
import { shiftDate, today } from "./ranking";

/** Annotations older than this are listed in the keyword detail only. */
export const CHANGES_DAYS = 180;
/** Rows shown per annotation when it has no affected words (manual ones): the biggest movers. */
const TOP_MOVERS = 10;
/** Rows shown per annotation with affected keywords. */
const MAX_AFFECTED = 40;

export type ImpactRow = { keywordId: number; term: string; impact: Impact };

export type AnnotationWithImpact = {
  annotation: Annotation;
  /** "affected": keywords with a word added or removed. "all": every tracked keyword (no word diff to go by). */
  scope: "affected" | "all";
  rows: ImpactRow[];
  /** Keywords measured (before trimming rows). */
  measured: number;
  summary: Record<ImpactVerdict, number>;
};

const moved = (r: ImpactRow) => (r.impact.change != null ? Math.abs(r.impact.change) : r.impact.verdict === "entered" || r.impact.verdict === "left" ? 1000 : -1);

/** The app's recent annotations with the impact of each one on its keywords (14 days before and after). */
export async function getAnnotationsWithImpact(appId: number): Promise<AnnotationWithImpact[]> {
  const db = getDb();
  const end = today();
  const since = shiftDate(end, -CHANGES_DAYS);
  const [annotations, keywords] = await Promise.all([
    db
      .select()
      .from(schema.annotations)
      .where(and(eq(schema.annotations.appId, appId), gte(schema.annotations.date, since)))
      .orderBy(desc(schema.annotations.date), desc(schema.annotations.id)),
    db
      .select({ id: schema.keywords.id, term: schema.keywords.term })
      .from(schema.appKeywords)
      .innerJoin(schema.keywords, eq(schema.keywords.id, schema.appKeywords.keywordId))
      .where(eq(schema.appKeywords.appId, appId)),
  ]);
  if (annotations.length === 0) return [];

  const oldest = annotations.at(-1)!.date;
  const snapshots = await db
    .select({ keywordId: schema.rankSnapshots.keywordId, date: schema.rankSnapshots.date, position: schema.rankSnapshots.position })
    .from(schema.rankSnapshots)
    .where(and(eq(schema.rankSnapshots.appId, appId), gte(schema.rankSnapshots.date, shiftDate(oldest, -IMPACT_WINDOW))))
    .orderBy(asc(schema.rankSnapshots.date));
  const history = new Map<number, ImpactPoint[]>();
  for (const s of snapshots) {
    const list = history.get(s.keywordId) ?? [];
    list.push({ date: s.date, position: s.position });
    history.set(s.keywordId, list);
  }

  return annotations.map((annotation) => {
    const affected = affectedKeywords(keywords, annotation.detail);
    const scope = affected.length > 0 ? "affected" : "all";
    const measuredRows = (scope === "affected" ? affected : keywords)
      .map((k) => ({ keywordId: k.id, term: k.term, impact: annotationImpact(history.get(k.id) ?? [], annotation.date, { today: end }) }))
      // With no word diff, keywords without any data around the date say nothing about this change.
      .filter((r) => scope === "affected" || r.impact.verdict !== "unknown");
    const sorted = [...measuredRows].sort((a, b) => moved(b) - moved(a) || a.term.localeCompare(b.term));
    return {
      annotation,
      scope,
      rows: sorted.slice(0, scope === "affected" ? MAX_AFFECTED : TOP_MOVERS),
      measured: measuredRows.length,
      summary: summarizeImpacts(measuredRows.map((r) => r.impact)),
    };
  });
}

export function getExperiments(appId: number): Promise<Experiment[]> {
  return getDb()
    .select()
    .from(schema.experiments)
    .where(eq(schema.experiments.appId, appId))
    .orderBy(desc(schema.experiments.createdAt));
}
