import { inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { KeywordSource } from "./keywords";
import type { KeywordIntent, RelevanceSource } from "./relevance";
import { trackRankings } from "./tracking";

export type FollowEntry = {
  term: string;
  relevance?: number | null;
  /** Defaults to "ai" when a relevance is given (AI ideas), null otherwise. */
  relevanceSource?: RelevanceSource | null;
  intent?: KeywordIntent | null;
  /** Overrides the batch source, e.g. when copying keywords to another country. */
  source?: KeywordSource;
};

/**
 * Adds keywords to an app and fetches today's position for the new ones right away
 * instead of waiting for the daily job. Keywords the app already follows are skipped.
 */
export async function followKeywords(appId: number, entries: FollowEntry[], source: KeywordSource) {
  if (entries.length === 0) return { added: 0, keywordIds: [], trackingFailed: false };
  const db = getDb();
  const terms = entries.map((e) => e.term);
  await db
    .insert(schema.keywords)
    .values(terms.map((term) => ({ term })))
    .onConflictDoNothing();
  const rows = await db
    .select({ id: schema.keywords.id, term: schema.keywords.term })
    .from(schema.keywords)
    .where(inArray(schema.keywords.term, terms));
  const byTerm = new Map(entries.map((e) => [e.term, e]));
  const inserted = await db
    .insert(schema.appKeywords)
    .values(
      rows.map((k) => {
        const e = byTerm.get(k.term);
        const relevance = e?.relevance ?? null;
        return {
          appId,
          keywordId: k.id,
          source: e?.source ?? source,
          relevance,
          relevanceSource: relevance == null ? null : (e?.relevanceSource ?? "ai"),
          intent: e?.intent ?? null,
          relevanceCheckedAt: relevance == null ? null : new Date(),
        };
      }),
    )
    .onConflictDoNothing()
    .returning({ keywordId: schema.appKeywords.keywordId });

  const keywordIds = inserted.map((k) => k.keywordId);
  let trackingFailed = false;
  if (keywordIds.length > 0) {
    const report = await trackRankings({ appId, keywordIds });
    trackingFailed = report.errors.length > 0;
  }
  return { added: keywordIds.length, keywordIds, trackingFailed };
}
