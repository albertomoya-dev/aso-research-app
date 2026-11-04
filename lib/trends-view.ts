import type { NextSeason } from "./health";
import { shiftDate } from "./ranking";
import { MONTH_LONG } from "./seasonality";

// Pure helpers of Mercado › Tendencias (phase 31): the single-hue heatmap scale, the «Próximos picos»
// cards and the annotation «Preparar» leaves behind.

/** Steps of the heatmap: 0–19, 20–39, 40–59, 60–79 and 80–100. */
export const HEAT_STEPS = 5;
export type HeatBucket = 1 | 2 | 3 | 4 | 5;

/** Bucket of a 0–100 value (clamped). */
export function heatBucket(value: number): HeatBucket {
  const v = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
  return Math.min(HEAT_STEPS, 1 + Math.floor(v / 20)) as HeatBucket;
}

/** Background and text of each bucket, from the --heat-* tokens (one hue; AA text in both themes). */
export const HEAT_CLASS: Record<HeatBucket, string> = {
  1: "bg-heat-1 text-ink",
  2: "bg-heat-2 text-ink",
  3: "bg-heat-3 text-ink",
  4: "bg-heat-4 text-on-heat",
  5: "bg-heat-5 text-on-heat",
};

/** Cards shown at most, and how far ahead a peak may start to get one (about three months). */
export const PEAK_CARDS = 6;
export const PEAK_CARD_DAYS = 92;

export type PeakCard = { term: string; keywordId?: number; month: number; days: number; weeks: number; running: boolean };

/** The «Próximos picos»: `nextSeasons` (nearest first) within `maxDays`, at most `limit`, with weeks to go. */
export function upcomingPeaks(seasons: NextSeason[], limit = PEAK_CARDS, maxDays = PEAK_CARD_DAYS): PeakCard[] {
  return seasons
    .filter((s) => s.days <= maxDays)
    .slice(0, limit)
    .map((s) => ({ ...s, weeks: Math.ceil(s.days / 7) }));
}

/** «En temporada ahora», «empieza esta semana», «empieza en 1 semana», «empieza en 5 semanas». */
export function startsInLabel(card: Pick<PeakCard, "running" | "weeks">): string {
  if (card.running) return "En temporada ahora";
  if (card.weeks <= 0) return "Empieza esta semana";
  return card.weeks === 1 ? "Empieza en 1 semana" : `Empieza en ${card.weeks} semanas`;
}

/** Stores take 2–4 weeks to reindex: the listing should be ready this long before the peak starts. */
export const PREPARE_LEAD_DAYS = 21;
const MAX_LABEL = 120;

/**
 * The annotation «Preparar» creates: dated three weeks before the peak starts, or today when that day has
 * passed (or the season is running), so it marks on the charts when the seasonal listing went in.
 */
export function prepareAnnotation(term: string, daysToPeak: number, date: string): { date: string; label: string } {
  const lead = daysToPeak - PREPARE_LEAD_DAYS;
  return {
    date: lead > 0 ? shiftDate(date, lead) : date,
    label: `Preparar temporada: ${term}`.slice(0, MAX_LABEL),
  };
}

/** What the listing editor's AI is asked to focus on (`?focus=` of the ficha): the keyword and its month. */
export function prepareFocus(term: string, month: number): string {
  return `Temporada de «${term}» en ${MONTH_LONG[month]}`.slice(0, 200);
}
