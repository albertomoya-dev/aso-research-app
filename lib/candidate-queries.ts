import { and, desc, eq, type SQL, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { App } from "@/db/schema";
import { type Candidate, type CandidateRow } from "./candidates";
import { normalizeKeyword } from "./keywords";

/** Everything Encontrar needs to merge the sources of one market. */
export type CandidateContext = {
  followed: string[];
  /** Terms dismissed in any source: never shown again. */
  dismissed: Set<string>;
  /** Measured popularity per term («Medir popularidad»). */
  measured: Map<string, number>;
  /** Stored candidates (review words, measured ones), every status. */
  stored: CandidateRow[];
  /** Pending AI ideas, as candidates. */
  ai: Candidate[];
  /** Model and prompt of the latest pending AI idea, for the «Generado con…» line. */
  aiGeneratedBy: string;
};

export async function getCandidateContext(appId: number): Promise<CandidateContext> {
  const db = getDb();
  const [followed, stored, suggestions] = await Promise.all([
    db
      .select({ term: schema.keywords.term })
      .from(schema.appKeywords)
      .innerJoin(schema.keywords, eq(schema.keywords.id, schema.appKeywords.keywordId))
      .where(eq(schema.appKeywords.appId, appId)),
    db
      .select({
        term: schema.keywordCandidates.term,
        source: schema.keywordCandidates.source,
        status: schema.keywordCandidates.status,
        reason: schema.keywordCandidates.reason,
        relevance: schema.keywordCandidates.relevance,
        popularityEstimate: schema.keywordCandidates.popularityEstimate,
        popularityMeasured: schema.keywordCandidates.popularityMeasured,
      })
      .from(schema.keywordCandidates)
      .where(eq(schema.keywordCandidates.appId, appId))
      .orderBy(desc(schema.keywordCandidates.createdAt)),
    db
      .select()
      .from(schema.aiSuggestions)
      .where(eq(schema.aiSuggestions.appId, appId))
      .orderBy(desc(schema.aiSuggestions.relevance), desc(schema.aiSuggestions.createdAt)),
  ]);
  const dismissed = new Set([
    ...stored.filter((r) => r.status === "dismissed").map((r) => r.term),
    ...suggestions.filter((s) => s.status === "dismissed").map((s) => normalizeKeyword(s.term)),
  ]);
  const measured = new Map(stored.flatMap((r) => (r.popularityMeasured == null ? [] : [[r.term, r.popularityMeasured] as const])));
  const pending = suggestions.filter((s) => s.status === "pending");
  return {
    followed: followed.map((f) => f.term),
    dismissed,
    measured,
    stored,
    ai: pending.map((s) => ({
      term: normalizeKeyword(s.term),
      source: "ai",
      suggestionId: s.id,
      relevance: s.relevance,
      popularityEstimate: null,
      popularityMeasured: null,
      reason: s.reason,
    })),
    aiGeneratedBy: pending[0] ? `${pending[0].model} · prompt ${pending[0].promptVersion}` : "",
  };
}

/**
 * Brings the words of the latest review analysis of each app read in this market's country into the
 * candidates, as pending «Reseñas» ones. Idempotent: a word already there (pending, followed or
 * dismissed) is left as it is, so a dismissed one never comes back.
 */
export async function syncReviewCandidates(app: Pick<App, "id" | "country">): Promise<number> {
  const db = getDb();
  const analyses = await db
    .select({ target: schema.reviewAnalyses.targetStoreId, result: schema.reviewAnalyses.result, stats: schema.reviewAnalyses.stats })
    .from(schema.reviewAnalyses)
    .where(and(eq(schema.reviewAnalyses.appId, app.id), eq(schema.reviewAnalyses.country, app.country)))
    .orderBy(desc(schema.reviewAnalyses.createdAt))
    .limit(50);
  const latest = [...Map.groupBy(analyses.filter((a) => a.stats.count > 0), (a) => a.target).values()].map((rows) => rows[0]);
  return insertReviewCandidates(
    app.id,
    latest.flatMap((a) => a.result.keywordIdeas ?? []),
  );
}

/** Stores review words as pending candidates (first reason wins). Returns how many were new. */
export async function insertReviewCandidates(appId: number, ideas: readonly { keyword: string; reason: string }[]): Promise<number> {
  const byTerm = new Map<string, string>();
  for (const idea of ideas) {
    const term = normalizeKeyword(idea.keyword);
    if (term && term.length <= 100 && !byTerm.has(term)) byTerm.set(term, idea.reason);
  }
  if (byTerm.size === 0) return 0;
  const inserted = await getDb()
    .insert(schema.keywordCandidates)
    .values([...byTerm].map(([term, reason]) => ({ appId, term, source: "reviews" as const, reason: reason ? `En las reseñas: ${reason}` : "Aparece en las reseñas" })))
    .onConflictDoNothing()
    .returning({ id: schema.keywordCandidates.id });
  return inserted.length;
}

/** `normalizeKeyword` in SQL: whitespace runs to one space, trimmed, lower case. */
const normalizedSql = (column: SQL) => sql`lower(btrim(regexp_replace(${column}, '[[:space:]]+', ' ', 'g')))`;

/**
 * SQL for the pending tray count of a market (`appId` is a column or a value): the same rule as
 * Encontrar's «Pendientes» (`mergeCandidates` over the pending AI ideas and `storedCandidates`): DISTINCT
 * normalized terms of the pending AI ideas and the pending stored candidates (not «ai» rows), leaving out
 * the terms the market follows and those dismissed in ANY source (keyword_candidates or ai_suggestions).
 */
export function pendingCandidatesSql(appId: unknown) {
  return sql<number>`(
    select count(distinct p.term) from (
      select ${normalizedSql(sql`s.term`)} as term from ${schema.aiSuggestions} s where s.app_id = ${appId} and s.status = 'pending'
      union all
      select ${normalizedSql(sql`c.term`)} from ${schema.keywordCandidates} c where c.app_id = ${appId} and c.status = 'pending' and c.source <> 'ai'
    ) p
    where p.term <> ''
      and not exists (
        select 1 from ${schema.appKeywords} ak join ${schema.keywords} k on k.id = ak.keyword_id
        where ak.app_id = ${appId} and ${normalizedSql(sql`k.term`)} = p.term)
      and not exists (
        select 1 from ${schema.keywordCandidates} d
        where d.app_id = ${appId} and d.status = 'dismissed' and ${normalizedSql(sql`d.term`)} = p.term)
      and not exists (
        select 1 from ${schema.aiSuggestions} d
        where d.app_id = ${appId} and d.status = 'dismissed' and ${normalizedSql(sql`d.term`)} = p.term)
  )`.mapWith(Number);
}
