import type { AppSummary } from "./stores/types";

/** Results fetched per search: the App Store API returns at most 200. */
export const RANK_DEPTH = 200;

export type RankResult = { position: number | null; top5: AppSummary[] };

/** Position is the 1-based index of the app in the search results; null when it is not there. */
export function computeRank(results: AppSummary[], storeId: string): RankResult {
  const index = results.findIndex((r) => r.id === storeId);
  return { position: index === -1 ? null : index + 1, top5: results.slice(0, 5) };
}

/**
 * Change in position between two days, positive when the app moved up.
 * Null when either day has no snapshot or the app was outside the results on both.
 */
export function positionChange(current: number | null | undefined, previous: number | null | undefined): number | null {
  if (current == null || previous == null) return null;
  return previous - current;
}

export type RankStatus = "top10" | "within-reach" | "far" | "out";

export function rankStatus(position: number | null): RankStatus {
  if (position == null) return "out";
  if (position <= 10) return "top10";
  if (position <= 30) return "within-reach";
  return "far";
}

/** Average position of the days in [from, to], ignoring days outside the results. */
export function averagePosition(points: { date: string; position: number | null }[], from: string, to: string): number | null {
  const values = points.filter((p) => p.date >= from && p.date <= to && p.position != null).map((p) => p.position!);
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** ISO date (YYYY-MM-DD) shifted by a number of days. */
export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
