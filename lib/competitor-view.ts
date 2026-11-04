import type { VisibilitySnapshot } from "./visibility";

// Pure helpers of Mercado › Competidores (phase 31): the share chart («Otros», bars or areas, colours)
// and the keywords a competitor shares with your app. Importable from server and client modules.

/** Series colours of the competitors, in fixed order. Your app always uses --series-own. */
export const SERIES_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)"];
/** Colour of «Otros»: neutral, so it never reads as a competitor. */
export const OTHERS_COLOR = "var(--muted)";
/** Key of «Otros» in the chart points. */
export const OTHERS_ID = "__others";
/** Series drawn at most (your app and the strongest competitors); the rest goes to «Otros». */
export const MAX_SHARE_SERIES = 5;

export type ShareSeries = { id: string; title: string; own: boolean };
export type SharePoint = Record<string, number | string>;

/**
 * The series to draw: at most MAX_SHARE_SERIES (your app first, then the order given), plus «Otros» for the
 * share nobody drawn holds. «Otros» is left out when no point has any.
 */
export function chartSeries(series: ShareSeries[], points: SharePoint[]): { series: ShareSeries[]; points: SharePoint[] } {
  const own = series.filter((s) => s.own);
  const shown = [...own, ...series.filter((s) => !s.own)].slice(0, MAX_SHARE_SERIES);
  const withRest = withOthers(points, shown.map((s) => s.id));
  const hasOthers = withRest.some((p) => Number(p[OTHERS_ID]) > 0);
  return {
    series: hasOthers ? [...shown, { id: OTHERS_ID, title: "Otros", own: false }] : shown,
    points: hasOthers ? withRest : points,
  };
}

/** Adds «Otros» to every point: what is left of 100 % after the given series, never below 0, one decimal. */
export function withOthers(points: SharePoint[], ids: string[]): SharePoint[] {
  return points.map((p) => {
    const sum = ids.reduce((a, id) => a + (Number(p[id]) || 0), 0);
    return { ...p, [OTHERS_ID]: Math.max(0, Math.round((100 - sum) * 10) / 10) };
  });
}

/** With a single day of data a line has nothing to join: horizontal bars of that day instead. */
export function shareChartKind(points: SharePoint[]): "bars" | "areas" {
  return points.length <= 1 ? "bars" : "areas";
}

/**
 * Colour of a series by its place in the list (your app first): your app in --series-own, the competitors
 * in --series-2…5 by position (the same colour they have on Resumen), «Otros» neutral.
 */
export function seriesColor(series: ShareSeries, index: number): string {
  if (series.own) return "var(--series-own)";
  if (series.id === OTHERS_ID) return OTHERS_COLOR;
  return SERIES_COLORS[Math.min(Math.max(index, 1), SERIES_COLORS.length - 1)];
}

export type SharedKeyword = { keywordId: number; term: string; position: number; ownPosition: number | null };

/**
 * Keywords where each app is in the TOP 5 (latest check of each keyword), with your app's position there
 * when it is too: «compartidas contigo». Best position first.
 */
export function sharedKeywords(latest: VisibilitySnapshot[], terms: Map<number, string>, ownStoreId: string): Map<string, SharedKeyword[]> {
  const out = new Map<string, SharedKeyword[]>();
  for (const s of latest) {
    const term = terms.get(s.keywordId);
    if (!term) continue;
    const own = s.top5.findIndex((a) => a.id === ownStoreId);
    s.top5.forEach((a, i) => {
      if (a.id === ownStoreId) return;
      const list = out.get(a.id) ?? [];
      list.push({ keywordId: s.keywordId, term, position: i + 1, ownPosition: own >= 0 ? own + 1 : null });
      out.set(a.id, list);
    });
  }
  for (const list of out.values()) list.sort((a, b) => a.position - b.position || a.term.localeCompare(b.term, "es"));
  return out;
}
