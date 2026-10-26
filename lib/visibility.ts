import type { AppSummary } from "./stores/types";

/**
 * Share of clicks a result gets by position, roughly following published store
 * search click-through curves. Only the TOP 5 is stored for every app, so the
 * share is measured there.
 */
export const POSITION_WEIGHT = [0.4, 0.22, 0.15, 0.12, 0.11];

export type VisibilitySnapshot = { keywordId: number; date: string; top5: AppSummary[] };

export type VisibilityRow = {
  app: AppSummary;
  /** 0–100: share of the weighted TOP 5 slots across the keywords. */
  share: number;
  /** Keywords where the app is in the TOP 5. */
  keywords: number;
  bestPosition: number;
};

/**
 * Each keyword is worth its popularity (or 1 when unknown, so it still counts) and
 * the slots of its TOP 5 split that worth by position weight.
 */
export function visibilityShare(snapshots: VisibilitySnapshot[], popularity: Map<number, number | null>): VisibilityRow[] {
  const rows = new Map<string, VisibilityRow & { points: number }>();
  let total = 0;
  for (const s of snapshots) {
    const worth = Math.max(1, popularity.get(s.keywordId) ?? 1);
    s.top5.slice(0, POSITION_WEIGHT.length).forEach((app, i) => {
      const points = worth * POSITION_WEIGHT[i];
      total += points;
      const row = rows.get(app.id) ?? { app, share: 0, keywords: 0, bestPosition: Infinity, points: 0 };
      row.points += points;
      row.keywords += 1;
      row.bestPosition = Math.min(row.bestPosition, i + 1);
      rows.set(app.id, row);
    });
  }
  return [...rows.values()]
    .map(({ points, ...row }) => ({ ...row, share: total ? (100 * points) / total : 0 }))
    .sort((a, b) => b.share - a.share);
}

/** Latest snapshot per keyword, so keywords checked on different days all count once. */
export function latestPerKeyword(snapshots: VisibilitySnapshot[]): VisibilitySnapshot[] {
  const latest = new Map<number, VisibilitySnapshot>();
  for (const s of snapshots) {
    const current = latest.get(s.keywordId);
    if (!current || s.date > current.date) latest.set(s.keywordId, s);
  }
  return [...latest.values()];
}

/** Daily share of the given apps; days with no snapshots are left out. */
export function shareByDay(snapshots: VisibilitySnapshot[], popularity: Map<number, number | null>, appIds: string[]) {
  const byDay = Map.groupBy(snapshots, (s) => s.date);
  return [...byDay.keys()].sort().map((date) => {
    const rows = visibilityShare(byDay.get(date)!, popularity);
    const point: Record<string, number | string> = { date };
    for (const id of appIds) point[id] = Math.round((rows.find((r) => r.app.id === id)?.share ?? 0) * 10) / 10;
    return point;
  });
}
