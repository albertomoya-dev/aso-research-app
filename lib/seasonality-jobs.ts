import { and, eq, gte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { loadAlertPrefs, prefsFor } from "./alert-jobs";
import { getCountry } from "./countries";
import { shiftDate } from "./ranking";
import { isRelevantKeyword } from "./relevance";
import { analyzeSeasonality, canAnnouncePeak, MONTH_LONG, peakAlertDue } from "./seasonality";

/** A peak alert for a keyword is not repeated within this many days (the warning window lasts a week). */
const REPEAT_DAYS = 60;

/**
 * Warns in Novedades about 3 weeks before a sustained Google peak starts, for relevant keywords
 * with store popularity of 10 or more. One alert per app, keyword and peak.
 */
export async function generateSeasonalAlerts(date: string): Promise<number> {
  const db = getDb();
  const [rows, prefs, recent] = await Promise.all([
    db
      .select({
        appId: schema.apps.id,
        country: schema.apps.country,
        keywordId: schema.keywords.id,
        term: schema.keywords.term,
        relevance: schema.appKeywords.relevance,
        intent: schema.appKeywords.intent,
        points: schema.keywordTrends.points,
        popularity: schema.keywordMetrics.popularity,
      })
      .from(schema.appKeywords)
      .innerJoin(schema.apps, eq(schema.apps.id, schema.appKeywords.appId))
      .innerJoin(schema.keywords, eq(schema.keywords.id, schema.appKeywords.keywordId))
      .innerJoin(
        schema.keywordTrends,
        and(eq(schema.keywordTrends.keywordId, schema.keywords.id), eq(schema.keywordTrends.country, schema.apps.country)),
      )
      .leftJoin(
        schema.keywordMetrics,
        and(
          eq(schema.keywordMetrics.keywordId, schema.keywords.id),
          eq(schema.keywordMetrics.store, schema.apps.store),
          eq(schema.keywordMetrics.country, schema.apps.country),
        ),
      ),
    loadAlertPrefs(),
    db
      .select({ appId: schema.alerts.appId, keywordId: schema.alerts.keywordId })
      .from(schema.alerts)
      .where(and(eq(schema.alerts.kind, "seasonal_peak"), gte(schema.alerts.date, shiftDate(date, -REPEAT_DAYS)))),
  ]);
  const alreadyWarned = new Set(recent.map((r) => `${r.appId}:${r.keywordId}`));

  const values = rows.flatMap((r) => {
    if (!r.points || alreadyWarned.has(`${r.appId}:${r.keywordId}`)) return [];
    if (!prefsFor(prefs, r.appId).kinds.includes("seasonal_peak")) return [];
    if (!canAnnouncePeak(r.popularity) || !isRelevantKeyword(r, getCountry(r.country).lang)) return [];
    const s = analyzeSeasonality(r.points);
    const due = s ? peakAlertDue(s.peaks, date) : null;
    if (!due) return [];
    return [
      {
        appId: r.appId,
        keywordId: r.keywordId,
        kind: "seasonal_peak" as const,
        tone: "info" as const,
        date,
        title: `«${r.term}» entra en temporada alta en ${MONTH_LONG[due.month]}`,
        detail: `El interés suele subir desde el 1 de ${MONTH_LONG[due.month]}, dentro de ${due.days} días. Prepara la ficha y las keywords ahora: las tiendas tardan 2–4 semanas en reindexar.`,
      },
    ];
  });
  if (values.length === 0) return 0;
  const inserted = await db.insert(schema.alerts).values(values).onConflictDoNothing().returning({ id: schema.alerts.id });
  return inserted.length;
}
