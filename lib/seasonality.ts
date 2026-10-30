import type { TrendPoint } from "./trends";

export const MONTH_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const MONTH_LONG = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** A month counts as a peak when its average interest is this much above the yearly mean. */
export const PEAK_FACTOR = 1.25;
/** Weekly points needed to talk about a year (Google Trends returns ~52 for 12 months). */
export const MIN_POINTS = 40;
/** More weeks at 0 than this share means Google barely has data for the term. */
export const MAX_ZERO_SHARE = 0.5;
/** Months with some interest needed before a yearly profile means anything. */
export const MIN_ACTIVE_MONTHS = 6;
/** Weeks above the threshold a month needs to be a peak: one viral week is not a season. */
export const SUSTAINED_WEEKS = 3;
/** Below this store popularity (0–100) a peak in Google is not worth preparing the listing for. */
export const MIN_POPULARITY = 10;
/**
 * How many standard errors a month's weekly mean must sit above the yearly mean to be a peak.
 * Google Trends rescales a flat but noisy series so that random months clear PEAK_FACTOR easily;
 * this keeps the noise of a month's few weeks from passing as a season.
 */
export const NOISE_K = 3;

/** Interest per calendar month, 0–100. Null for the month still in progress when nothing older covers it. */
export type MonthlyProfile = (number | null)[];

const monthOf = (p: TrendPoint) => Number(p.date.slice(5, 7)) - 1;
const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

/**
 * Points of complete months only. The month of the latest point was still running when the
 * data was downloaded, so its weeks are dropped (the same month of the previous year stays).
 */
export function completePoints(points: TrendPoint[]): TrendPoint[] {
  if (points.length === 0) return points;
  const latest = points.reduce((a, p) => (p.date > a ? p.date : a), points[0].date).slice(0, 7);
  return points.filter((p) => p.date.slice(0, 7) !== latest);
}

function byMonth(points: TrendPoint[]): number[][] {
  const buckets = Array.from({ length: 12 }, () => [] as number[]);
  for (const p of points) buckets[monthOf(p)].push(p.value);
  return buckets;
}

/**
 * Is there enough signal to talk about seasons? Needs a year of weekly points, at most half
 * of them at 0 and at least 6 months with some interest. A series of 51 zeros and one 100 fails.
 */
export function signalQuality(points: TrendPoint[]): boolean {
  if (points.length < MIN_POINTS) return false;
  const zeros = points.filter((p) => p.value <= 0).length;
  if (zeros / points.length > MAX_ZERO_SHARE) return false;
  return byMonth(points).filter((b) => mean(b) > 0).length >= MIN_ACTIVE_MONTHS;
}

/**
 * Average Google Trends interest per calendar month (index 0 = January), rescaled so the
 * strongest month is 100. The month in progress is left out (see `completePoints`). Null when
 * the signal is too weak (`signalQuality`) or a complete month has no data.
 */
export function monthlyProfile(points: TrendPoint[]): MonthlyProfile | null {
  if (points.length === 0) return null;
  const complete = completePoints(points);
  if (!signalQuality(complete)) return null;
  const partial = monthOf(points.reduce((a, p) => (p.date > a.date ? p : a)));
  const buckets = byMonth(complete);
  if (buckets.some((b, m) => b.length === 0 && m !== partial)) return null;
  const avgs = buckets.map((b) => (b.length ? mean(b) : null));
  const max = Math.max(...avgs.map((a) => a ?? 0));
  return max > 0 ? avgs.map((a) => (a == null ? null : Math.round((100 * a) / max))) : null;
}

/**
 * Week-to-week noise: the pooled standard deviation of the weeks around their own month's mean.
 * Unlike the plain deviation of the year, a real season (months far apart) does not inflate it.
 */
export function weeklyNoise(buckets: number[][]): number {
  let squares = 0;
  let freedom = 0;
  for (const weeks of buckets) {
    if (weeks.length < 2) continue;
    const m = mean(weeks);
    squares += weeks.reduce((a, v) => a + (v - m) ** 2, 0);
    freedom += weeks.length - 1;
  }
  return freedom > 0 ? Math.sqrt(squares / freedom) : 0;
}

/**
 * Months with at least 3 weeks above the peak threshold (PEAK_FACTOR × the yearly weekly mean)
 * whose weekly mean also clears the yearly mean by NOISE_K standard errors (`weeklyNoise` / √weeks),
 * so a flat noisy series has no peaks. A month with only 1–2 weeks of data needs all of them, and at least 2.
 */
export function sustainedMonths(points: TrendPoint[]): boolean[] {
  const complete = completePoints(points);
  const yearMean = mean(complete.map((p) => p.value));
  const threshold = yearMean * PEAK_FACTOR;
  const buckets = byMonth(complete);
  const noise = weeklyNoise(buckets);
  return buckets.map((weeks) => {
    if (weeks.length === 0) return false;
    const above = weeks.filter((v) => v > 0 && v >= threshold).length;
    const clearOfNoise = mean(weeks) - yearMean >= (NOISE_K * noise) / Math.sqrt(weeks.length);
    return clearOfNoise && above >= Math.max(2, Math.min(SUSTAINED_WEEKS, weeks.length));
  });
}

/** Months whose average stands out (≥ PEAK_FACTOR × the mean) and, when given, are sustained. */
export function peakMonths(profile: MonthlyProfile, sustained?: boolean[]): number[] {
  const known = profile.filter((v): v is number => v != null);
  const avg = mean(known);
  return profile.flatMap((v, m) => (avg > 0 && v != null && v >= avg * PEAK_FACTOR && (sustained?.[m] ?? true) ? [m] : []));
}

/** How seasonal a keyword is: strongest month over the yearly mean (1 = flat). */
export function seasonalityStrength(profile: MonthlyProfile): number {
  const known = profile.filter((v): v is number => v != null);
  const avg = mean(known);
  return avg > 0 ? Math.max(...known) / avg : 1;
}

export type Seasonality = { profile: MonthlyProfile; peaks: number[]; strength: number };

/** Profile, sustained peaks and strength in one go. Null when there is not enough signal. */
export function analyzeSeasonality(points: TrendPoint[]): Seasonality | null {
  const profile = monthlyProfile(points);
  if (!profile) return null;
  return { profile, peaks: peakMonths(profile, sustainedMonths(points)), strength: seasonalityStrength(profile) };
}

/** A Google peak is announced only for keywords people also search in the store. Unknown popularity does not count. */
export function canAnnouncePeak(popularity: number | null | undefined): boolean {
  return popularity != null && popularity >= MIN_POPULARITY;
}

/**
 * The month to mention on a keyword page («Pico de interés en …»): the strongest sustained
 * peak, or null when there is no clear one or the store popularity is below MIN_POPULARITY.
 */
export function peakMonth(points: TrendPoint[], popularity: number | null | undefined): string | null {
  if (!canAnnouncePeak(popularity)) return null;
  const s = analyzeSeasonality(points);
  if (!s || s.peaks.length === 0) return null;
  const best = s.peaks.reduce((a, m) => ((s.profile[m] ?? 0) > (s.profile[a] ?? 0) ? m : a));
  return MONTH_LONG[best];
}

export type UpcomingPeak = { month: number; monthsAhead: number };

/** Peak months that start a season (the month before is not a peak). */
export function peakStarts(peaks: number[]): number[] {
  const set = new Set(peaks);
  return peaks.filter((m) => !set.has((m + 11) % 12));
}

/**
 * The next peak starting within `horizon` months of `month` (0–11). A peak that is
 * already running counts as 0 months ahead only if it started this month.
 */
export function nextPeak(peaks: number[], month: number, horizon = 2): UpcomingPeak | null {
  const starts = new Set(peakStarts(peaks));
  for (let ahead = 0; ahead <= horizon; ahead++) {
    const m = (month + ahead) % 12;
    if (starts.has(m)) return { month: m, monthsAhead: ahead };
  }
  return null;
}

/** Days before a peak starts when Novedades warns about it: stores take 2–4 weeks to reindex. */
export const PEAK_ALERT_WINDOW = { from: 21, to: 27 };

export type PeakAlertDue = { month: number; start: string; days: number };

/**
 * The peak whose first day is 21–27 days after `date` (YYYY-MM-DD), if any. The daily job
 * runs every day, so the window gives several chances; the caller stores one alert per peak.
 */
export function peakAlertDue(peaks: number[], date: string): PeakAlertDue | null {
  const today = new Date(`${date}T00:00:00Z`);
  for (const m of peakStarts(peaks)) {
    let year = today.getUTCFullYear();
    if (m < today.getUTCMonth() || (m === today.getUTCMonth() && today.getUTCDate() > 1)) year++;
    const start = new Date(Date.UTC(year, m, 1));
    const days = Math.round((start.getTime() - today.getTime()) / 86_400_000);
    if (days >= PEAK_ALERT_WINDOW.from && days <= PEAK_ALERT_WINDOW.to) {
      return { month: m, start: start.toISOString().slice(0, 10), days };
    }
  }
  return null;
}
