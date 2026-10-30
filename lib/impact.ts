import { shiftDate } from "./ranking";

// Impact of a dated change on one keyword (F8): mean position in the 14 days before and after.
// A day where the app was outside the results is not "position 31": we do not know where it was, so it
// is left out of the mean and counted apart. Days without a check are counted too, so the screen can say
// how much data each mean stands on.

export const IMPACT_WINDOW = 14;
/** Changes smaller than this (in positions) read as «sin cambios». */
export const FLAT_THRESHOLD = 1;

export type ImpactPoint = { date: string; position: number | null };

export type WindowStats = {
  /** Mean of the days with a position; null when there are none. */
  mean: number | null;
  /** Days with a position. */
  ranked: number;
  /** Days checked with the app outside the results. */
  outside: number;
  /** Days of the window (up to today) with no check at all. */
  unchecked: number;
};

export type ImpactVerdict = "up" | "down" | "flat" | "entered" | "left" | "unknown";

export type Impact = {
  before: WindowStats;
  after: WindowStats;
  /** Positions gained (positive = better), from the two means. Null when either side has no position. */
  change: number | null;
  verdict: ImpactVerdict;
  /** False while the window after the change has not finished. */
  complete: boolean;
};

function stats(points: ImpactPoint[], from: string, to: string): WindowStats {
  let ranked = 0;
  let outside = 0;
  let sum = 0;
  const seen = new Set<string>();
  for (const p of points) {
    if (p.date < from || p.date > to || seen.has(p.date)) continue;
    seen.add(p.date);
    if (p.position == null) outside++;
    else {
      ranked++;
      sum += p.position;
    }
  }
  let days = 0;
  for (let d = from; d <= to; d = shiftDate(d, 1)) days++;
  return { mean: ranked ? sum / ranked : null, ranked, outside, unchecked: Math.max(0, days - ranked - outside) };
}

/**
 * Compares the `window` days before `date` with the `window` days after it (the day itself is left out:
 * the change may land at any hour). `today` caps the window after, so pending days are not counted as unchecked.
 */
export function annotationImpact(history: ImpactPoint[], date: string, opts: { window?: number; today: string }): Impact {
  const window = opts.window ?? IMPACT_WINDOW;
  const afterEnd = shiftDate(date, window);
  const before = stats(history, shiftDate(date, -window), shiftDate(date, -1));
  const cap = afterEnd < opts.today ? afterEnd : opts.today;
  const after = cap > date ? stats(history, shiftDate(date, 1), cap) : { mean: null, ranked: 0, outside: 0, unchecked: 0 };
  const change = before.mean != null && after.mean != null ? before.mean - after.mean : null;

  let verdict: ImpactVerdict = "unknown";
  if (change != null) verdict = Math.abs(change) < FLAT_THRESHOLD ? "flat" : change > 0 ? "up" : "down";
  else if (before.ranked === 0 && before.outside > 0 && after.ranked > 0) verdict = "entered";
  else if (before.ranked > 0 && after.ranked === 0 && after.outside > 0) verdict = "left";

  return { before, after, change, verdict, complete: afterEnd <= opts.today };
}

export const IMPACT_VERDICT_LABEL: Record<ImpactVerdict, string> = {
  up: "Sube",
  down: "Baja",
  flat: "Sin cambios",
  entered: "Entra en resultados",
  left: "Sale de resultados",
  unknown: "Sin datos suficientes",
};

/** How many keywords fall in each verdict. */
export function summarizeImpacts(impacts: Impact[]): Record<ImpactVerdict, number> {
  const out: Record<ImpactVerdict, number> = { up: 0, down: 0, flat: 0, entered: 0, left: 0, unknown: 0 };
  for (const i of impacts) out[i.verdict]++;
  return out;
}
