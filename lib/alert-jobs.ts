import { and, count, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { detectRankAlerts, type RankPoint } from "./alerts";
import { shiftDate } from "./ranking";

/** How far back to look for the previous check of a keyword. */
const LOOKBACK_DAYS = 7;

/** Compares the checks made on `date` with each keyword's previous check and stores the alerts. */
export async function generateRankAlerts(date: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({
      appId: schema.rankSnapshots.appId,
      ownStoreId: schema.apps.storeId,
      keywordId: schema.rankSnapshots.keywordId,
      term: schema.keywords.term,
      date: schema.rankSnapshots.date,
      position: schema.rankSnapshots.position,
      top5: schema.rankSnapshots.top5,
    })
    .from(schema.rankSnapshots)
    .innerJoin(schema.apps, eq(schema.apps.id, schema.rankSnapshots.appId))
    .innerJoin(schema.keywords, eq(schema.keywords.id, schema.rankSnapshots.keywordId))
    .where(and(gte(schema.rankSnapshots.date, shiftDate(date, -LOOKBACK_DAYS)), lte(schema.rankSnapshots.date, date)))
    .orderBy(desc(schema.rankSnapshots.date));

  let created = 0;
  for (const [appId, appRows] of Map.groupBy(rows, (r) => r.appId)) {
    const current: RankPoint[] = appRows.filter((r) => r.date === date);
    // Rows are newest first, so the first older row per keyword is its previous check.
    const previous = new Map<number, RankPoint>();
    for (const r of appRows) if (r.date < date && !previous.has(r.keywordId)) previous.set(r.keywordId, r);
    const found = detectRankAlerts([...previous.values()], current, appRows[0].ownStoreId);
    if (found.length === 0) continue;
    const inserted = await db
      .insert(schema.alerts)
      .values(found.map((a) => ({ ...a, appId, date })))
      .onConflictDoNothing()
      .returning({ id: schema.alerts.id });
    created += inserted.length;
  }
  return created;
}

export async function unreadAlertCount(): Promise<number> {
  const [row] = await getDb().select({ n: count() }).from(schema.alerts).where(isNull(schema.alerts.readAt));
  return row?.n ?? 0;
}
