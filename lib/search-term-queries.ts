import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { officialStats, type OfficialStats, type SearchTermSource, type SearchTermStat } from "./search-terms";

/** Inserts or replaces the rows of an import (same app, source, term and period). Returns how many were written. */
export async function saveSearchTermStats(appId: number, rows: SearchTermStat[], source: SearchTermSource = "play_csv"): Promise<number> {
  const db = getDb();
  const importedAt = new Date();
  // Neon's HTTP driver sends one statement per call: batches of 500 keep each request small.
  for (let i = 0; i < rows.length; i += 500) {
    await db
      .insert(schema.searchTermStats)
      .values(rows.slice(i, i + 500).map((r) => ({ appId, source, ...r, importedAt })))
      .onConflictDoUpdate({
        target: [
          schema.searchTermStats.appId,
          schema.searchTermStats.source,
          schema.searchTermStats.term,
          schema.searchTermStats.periodStart,
          schema.searchTermStats.periodEnd,
        ],
        set: { visitors: sql`excluded.visitors`, acquisitions: sql`excluded.acquisitions`, importedAt },
      });
  }
  return rows.length;
}

/** Official figures of the latest 30 days imported (see officialStats), or null without imports. */
export async function getOfficialStats(appId: number, source: SearchTermSource = "play_csv"): Promise<OfficialStats> {
  const rows = await getDb()
    .select({
      term: schema.searchTermStats.term,
      periodStart: schema.searchTermStats.periodStart,
      periodEnd: schema.searchTermStats.periodEnd,
      visitors: schema.searchTermStats.visitors,
      acquisitions: schema.searchTermStats.acquisitions,
    })
    .from(schema.searchTermStats)
    // The latest 400 days are plenty for a 30-day window and keep the read bounded.
    .where(and(eq(schema.searchTermStats.appId, appId), eq(schema.searchTermStats.source, source), sql`${schema.searchTermStats.periodEnd} >= current_date - 400`));
  return officialStats(rows);
}

export async function deleteSearchTermStats(appId: number, source: SearchTermSource = "play_csv"): Promise<void> {
  await getDb().delete(schema.searchTermStats).where(and(eq(schema.searchTermStats.appId, appId), eq(schema.searchTermStats.source, source)));
}
