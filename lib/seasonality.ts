import type { TrendPoint } from "./trends";

export const MONTH_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const MONTH_LONG = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** A month counts as a peak when its average interest is this much above the yearly mean. */
export const PEAK_FACTOR = 1.25;

/**
 * Average Google Trends interest per calendar month (index 0 = January), rescaled so
 * the strongest month is 100. Null when there is less than a year of data or no interest.
 */
export function monthlyProfile(points: TrendPoint[]): number[] | null {
  if (points.length < 40) return null;
  const sums = new Array<number>(12).fill(0);
  const counts = new Array<number>(12).fill(0);
  for (const p of points) {
    const m = Number(p.date.slice(5, 7)) - 1;
    sums[m] += p.value;
    counts[m]++;
  }
  if (counts.some((c) => c === 0)) return null;
  const avgs = sums.map((s, i) => s / counts[i]);
  const max = Math.max(...avgs);
  return max > 0 ? avgs.map((a) => Math.round((100 * a) / max)) : null;
}

export function peakMonths(profile: number[]): number[] {
  const mean = profile.reduce((a, b) => a + b, 0) / profile.length;
  return profile.flatMap((v, m) => (mean > 0 && v >= mean * PEAK_FACTOR ? [m] : []));
}

/** How seasonal a keyword is: strongest month over the yearly mean (1 = flat). */
export function seasonalityStrength(profile: number[]): number {
  const mean = profile.reduce((a, b) => a + b, 0) / profile.length;
  return mean > 0 ? Math.max(...profile) / mean : 1;
}

export type UpcomingPeak = { month: number; monthsAhead: number };

/**
 * The next peak starting within `horizon` months of `month` (0–11). A peak that is
 * already running counts as 0 months ahead only if it started this month.
 */
export function nextPeak(profile: number[], month: number, horizon = 2): UpcomingPeak | null {
  const peaks = new Set(peakMonths(profile));
  for (let ahead = 0; ahead <= horizon; ahead++) {
    const m = (month + ahead) % 12;
    const previous = (m + 11) % 12;
    if (peaks.has(m) && !peaks.has(previous)) return { month: m, monthsAhead: ahead };
  }
  return null;
}
