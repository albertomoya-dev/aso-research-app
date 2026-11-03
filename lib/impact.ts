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

export type AggregateImpact = {
  /** Keywords with a mean position on both sides: the ones the averages stand on. */
  affected: number;
  /** Mean of their mean positions before and after (1 decimal); null when `affected` is 0. */
  before: number | null;
  after: number | null;
  /** Positions gained on average (positive = better); null when `affected` is 0. */
  change: number | null;
  /** From the averages; without any pair, «entered» or «left» when that is what most did, else «unknown». */
  verdict: ImpactVerdict;
  /** Keywords that entered or left the results (no mean on one side): counted apart. */
  entered: number;
  left: number;
  /** False while any window after the change is still running. */
  complete: boolean;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * One line for a change across its keywords (the visibility chart's tooltip): the average of the mean
 * positions before and after, over the keywords measured on both sides. Entries and exits have no
 * position on one side, so they are counted apart instead of being given a made-up rank.
 */
export function aggregateImpact(impacts: Impact[]): AggregateImpact {
  const pairs = impacts.filter((i) => i.before.mean != null && i.after.mean != null);
  const entered = impacts.filter((i) => i.verdict === "entered").length;
  const left = impacts.filter((i) => i.verdict === "left").length;
  const complete = impacts.every((i) => i.complete);
  if (pairs.length === 0) {
    const verdict: ImpactVerdict = entered > left ? "entered" : left > entered ? "left" : "unknown";
    return { affected: 0, before: null, after: null, change: null, verdict, entered, left, complete };
  }
  const before = pairs.reduce((s, i) => s + i.before.mean!, 0) / pairs.length;
  const after = pairs.reduce((s, i) => s + i.after.mean!, 0) / pairs.length;
  const change = before - after;
  const verdict: ImpactVerdict = Math.abs(change) < FLAT_THRESHOLD ? "flat" : change > 0 ? "up" : "down";
  return { affected: pairs.length, before: round1(before), after: round1(after), change: round1(change), verdict, entered, left, complete };
}

/** «12 keywords · 23 → 18 ▲», plus entries and exits; «Sin datos suficientes» when nothing was measured. */
export function formatAggregateImpact(a: AggregateImpact): string {
  const parts: string[] = [];
  if (a.affected > 0 && a.before != null && a.after != null) {
    // Whole positions read best; a small change keeps its decimal so «9 → 10 =» never shows.
    const digits = a.verdict === "flat" || Math.round(a.before) === Math.round(a.after) ? 1 : 0;
    const n = (x: number) => x.toLocaleString("es-ES", { maximumFractionDigits: digits });
    const arrow = a.verdict === "up" ? "▲" : a.verdict === "down" ? "▼" : "=";
    parts.push(`${a.affected} ${a.affected === 1 ? "keyword" : "keywords"} · ${n(a.before)} → ${n(a.after)} ${arrow}`);
  }
  if (a.entered > 0) parts.push(`${a.entered} ${a.entered === 1 ? "entra" : "entran"} en resultados`);
  if (a.left > 0) parts.push(`${a.left} ${a.left === 1 ? "sale" : "salen"} de resultados`);
  return parts.length ? parts.join(" · ") : IMPACT_VERDICT_LABEL.unknown;
}
