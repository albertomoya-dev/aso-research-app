import { and, eq, gte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { loadAlertPrefs, prefsFor } from "./alert-jobs";
import { isAlertRelevant } from "./alerts";
import { getCountry } from "./countries";
import { shiftDate } from "./ranking";
import type { KeywordIntent } from "./relevance";
import { analyzeSeasonality, canAnnouncePeak, MONTH_LONG, PEAK_ALERT_WINDOW, peakAlertDue } from "./seasonality";
import { isNoiseTerm } from "./stopwords";

/** Past peak alerts are looked up this far back: longer than the week-long warning window. */
const REPEAT_DAYS = 35;

/**
 * Month (YYYY-MM) of the peak a seasonal alert dated `alertDate` announced. Alerts are only written
 * 21–27 days before a peak's first day, so that day falls in the month 27 days later.
 */
export function warnedPeakMonth(alertDate: string): string {
  return shiftDate(alertDate, PEAK_ALERT_WINDOW.to).slice(0, 7);
}

/** One alert per app, keyword and peak start: a second peak of the same keyword is warned about too. */
export const peakKey = (appId: number, keywordId: number | null, peakMonth: string) => `${appId}:${keywordId}:${peakMonth}`;

/**
 * Same noise rules as ranking alerts: no filler words, no foreign intent and, when rated, at least
 * the app's minimum relevance (alert preferences). Unrated keywords pass.
 */
export function isSeasonalAlertRelevant(
  row: { term: string; relevance: number | null; intent: KeywordIntent | null },
  lang: string,
  minRelevance: number,
): boolean {
  return !isNoiseTerm(row.term, lang) && isAlertRelevant(row, minRelevance);
}

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
      .select({ appId: schema.alerts.appId, keywordId: schema.alerts.keywordId, date: schema.alerts.date })
      .from(schema.alerts)
      .where(and(eq(schema.alerts.kind, "seasonal_peak"), gte(schema.alerts.date, shiftDate(date, -REPEAT_DAYS)))),
  ]);
  const alreadyWarned = new Set(recent.map((r) => peakKey(r.appId, r.keywordId, warnedPeakMonth(r.date))));

  const values = rows.flatMap((r) => {
    if (!r.points) return [];
    const appPrefs = prefsFor(prefs, r.appId);
    if (!appPrefs.kinds.includes("seasonal_peak")) return [];
    if (!canAnnouncePeak(r.popularity) || !isSeasonalAlertRelevant(r, getCountry(r.country).lang, appPrefs.minRelevance)) return [];
    const s = analyzeSeasonality(r.points);
    const due = s ? peakAlertDue(s.peaks, date) : null;
    if (!due || alreadyWarned.has(peakKey(r.appId, r.keywordId, due.start.slice(0, 7)))) return [];
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
