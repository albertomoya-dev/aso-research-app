import { and, count, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import {
  ALL_ALERT_KINDS,
  type AlertPrefs,
  applyAlertPrefs,
  DEFAULT_ALERT_PREFS,
  detectRankAlerts,
  type DraftAlert,
  groupLeaderAlerts,
  type RankPoint,
} from "./alerts";
import { shiftDate } from "./ranking";

/** How far back to look for the previous check of a keyword. */
const LOOKBACK_DAYS = 7;

/** Saved preferences per app; apps without a row get the defaults. */
export async function loadAlertPrefs(appIds?: number[]): Promise<Map<number, AlertPrefs>> {
  if (appIds && appIds.length === 0) return new Map();
  const rows = await getDb()
    .select()
    .from(schema.alertPrefs)
    .where(appIds ? inArray(schema.alertPrefs.appId, appIds) : undefined);
  const known = new Set<string>(ALL_ALERT_KINDS);
  return new Map(rows.map((r) => [r.appId, { kinds: r.kinds.filter((k) => known.has(k)), minRelevance: r.minRelevance }]));
}

export const prefsFor = (prefs: Map<number, AlertPrefs>, appId: number) => prefs.get(appId) ?? DEFAULT_ALERT_PREFS;

/** Compares the checks made on `date` with each keyword's previous check and stores the alerts. */
export async function generateRankAlerts(date: string): Promise<number> {
  const db = getDb();
  const [rows, watched, prefs] = await Promise.all([
    db
      .select({
        appId: schema.rankSnapshots.appId,
        ownStoreId: schema.apps.storeId,
        keywordId: schema.rankSnapshots.keywordId,
        term: schema.keywords.term,
        date: schema.rankSnapshots.date,
        position: schema.rankSnapshots.position,
        top5: schema.rankSnapshots.top5,
        depth: schema.rankSnapshots.depth,
        relevance: schema.appKeywords.relevance,
        intent: schema.appKeywords.intent,
      })
      .from(schema.rankSnapshots)
      .innerJoin(schema.apps, eq(schema.apps.id, schema.rankSnapshots.appId))
      .innerJoin(schema.keywords, eq(schema.keywords.id, schema.rankSnapshots.keywordId))
      // Only keywords the app still follows, with their relevance.
      .innerJoin(
        schema.appKeywords,
        and(eq(schema.appKeywords.appId, schema.rankSnapshots.appId), eq(schema.appKeywords.keywordId, schema.rankSnapshots.keywordId)),
      )
      .where(and(gte(schema.rankSnapshots.date, shiftDate(date, -LOOKBACK_DAYS)), lte(schema.rankSnapshots.date, date)))
      .orderBy(desc(schema.rankSnapshots.date)),
    db.select({ appId: schema.competitors.appId, storeId: schema.competitors.storeId }).from(schema.competitors),
    loadAlertPrefs(),
  ]);
  const watchedByApp = Map.groupBy(watched, (w) => w.appId);

  let created = 0;
  for (const [appId, appRows] of Map.groupBy(rows, (r) => r.appId)) {
    const current: RankPoint[] = appRows.filter((r) => r.date === date);
    // Rows are newest first, so the first older row per keyword is its previous check.
    const previous = new Map<number, RankPoint>();
    for (const r of appRows) if (r.date < date && !previous.has(r.keywordId)) previous.set(r.keywordId, r);
    const appPrefs = prefsFor(prefs, appId);
    const found = applyAlertPrefs(
      groupLeaderAlerts(
        detectRankAlerts([...previous.values()], current, appRows[0].ownStoreId, {
          watchedStoreIds: new Set((watchedByApp.get(appId) ?? []).map((w) => w.storeId)),
          minRelevance: appPrefs.minRelevance,
        }),
      ),
      appPrefs,
    );
    const toRow = ({ kind, keywordId, tone, title, detail }: DraftAlert) => ({ kind, keywordId, tone, title, detail, appId, date });
    const perKeyword = found.filter((a) => a.keywordId != null);
    if (perKeyword.length > 0) {
      const inserted = await db
        .insert(schema.alerts)
        .values(perKeyword.map(toRow))
        .onConflictDoNothing()
        .returning({ id: schema.alerts.id });
      created += inserted.length;
    }
    // The grouped #1 alert has no keyword, so the unique index cannot dedupe it (nulls are
    // distinct): update the day's row in place, unread again only when its content changed.
    const group = found.find((a) => a.keywordId == null);
    if (group) {
      const sameDay = and(
        eq(schema.alerts.appId, appId),
        eq(schema.alerts.kind, group.kind),
        eq(schema.alerts.date, date),
        isNull(schema.alerts.keywordId),
        isNull(schema.alerts.competitorId),
      );
      const [existing] = await db.select({ id: schema.alerts.id, detail: schema.alerts.detail }).from(schema.alerts).where(sameDay).limit(1);
      if (!existing) {
        await db.insert(schema.alerts).values(toRow(group));
        created++;
      } else if (existing.detail !== group.detail) {
        await db
          .update(schema.alerts)
          .set({ title: group.title, detail: group.detail, readAt: null })
          .where(eq(schema.alerts.id, existing.id));
      }
    }
  }
  return created;
}

export async function unreadAlertCount(): Promise<number> {
  const [row] = await getDb().select({ n: count() }).from(schema.alerts).where(isNull(schema.alerts.readAt));
  return row?.n ?? 0;
}
