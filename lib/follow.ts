import { inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { trackRankings } from "./tracking";

type Source = "manual" | "ai" | "autocomplete";

/**
 * Adds keywords to an app and fetches today's position for the new ones right away
 * instead of waiting for the daily job. Keywords the app already follows are skipped.
 */
export async function followKeywords(appId: number, entries: { term: string; relevance?: number }[], source: Source) {
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
  const relevance = new Map(entries.map((e) => [e.term, e.relevance ?? null]));
  const inserted = await db
    .insert(schema.appKeywords)
    .values(rows.map((k) => ({ appId, keywordId: k.id, source, relevance: relevance.get(k.term) ?? null })))
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
