import type { ParsedSearchTerms } from "./play-console/csv";
import { shiftDate } from "./ranking";

// Official search term figures (F2): visitors and acquisitions that Google Play Console reports for each
// search term. Pure helpers; the queries live in lib/search-term-queries.ts.

export const SEARCH_TERM_SOURCES = ["play_csv"] as const;
export type SearchTermSource = (typeof SEARCH_TERM_SOURCES)[number];

/** One stored row: a term over a period (one day for the Cloud Storage report, the export's range otherwise). */
export type SearchTermStat = { term: string; periodStart: string; periodEnd: string; visitors: number; acquisitions: number };

/** Window shown next to the keywords: the last 30 days of the imported data. */
export const OFFICIAL_WINDOW_DAYS = 30;

export class PeriodRequiredError extends Error {}

/**
 * Rows to store from a parsed CSV. Files with a date column keep one row per day; files without one
 * (exports from the console screens) need the period the user chose there.
 */
export function statRowsFrom(parsed: ParsedSearchTerms, period: { start: string; end: string } | null): SearchTermStat[] {
  if (parsed.hasDates) {
    return parsed.rows.map((r) => ({ term: r.term, periodStart: r.date!, periodEnd: r.date!, visitors: r.visitors, acquisitions: r.acquisitions }));
  }
  if (!period) {
    throw new PeriodRequiredError("Este CSV no tiene columna de fecha: indica el periodo que elegiste en Play Console al descargarlo.");
  }
  if (period.start > period.end) throw new PeriodRequiredError("La fecha de inicio del periodo es posterior a la de fin.");
  // Rows without a date in a file that has some: summed into the period too.
  const byTerm = new Map<string, SearchTermStat>();
  for (const r of parsed.rows) {
    const s = byTerm.get(r.term) ?? { term: r.term, periodStart: period.start, periodEnd: period.end, visitors: 0, acquisitions: 0 };
    s.visitors += r.visitors;
    s.acquisitions += r.acquisitions;
    byTerm.set(r.term, s);
  }
  return [...byTerm.values()];
}

export type OfficialTermStats = { visitors: number; acquisitions: number };
export type OfficialStats = { from: string; to: string; byTerm: Map<string, OfficialTermStats> } | null;

/**
 * Totals per term over the latest window of imported data: the 30 days up to the most recent date. If
 * the latest import is a single longer period (a 90-day export), that period is used as it is, so the
 * figures never mix two overlapping exports. Null when nothing was imported.
 */
export function officialStats(rows: SearchTermStat[], windowDays = OFFICIAL_WINDOW_DAYS): OfficialStats {
  if (rows.length === 0) return null;
  const to = rows.reduce((max, r) => (r.periodEnd > max ? r.periodEnd : max), rows[0].periodEnd);
  const windowStart = shiftDate(to, -(windowDays - 1));
  let picked = rows.filter((r) => r.periodStart >= windowStart);
  if (picked.length === 0) {
    const latestStart = rows.filter((r) => r.periodEnd === to).reduce((min, r) => (r.periodStart < min ? r.periodStart : min), to);
    picked = rows.filter((r) => r.periodEnd === to && r.periodStart === latestStart);
  }
  const from = picked.reduce((min, r) => (r.periodStart < min ? r.periodStart : min), to);
  const byTerm = new Map<string, OfficialTermStats>();
  for (const r of picked) {
    const s = byTerm.get(r.term) ?? { visitors: 0, acquisitions: 0 };
    s.visitors += r.visitors;
    s.acquisitions += r.acquisitions;
    byTerm.set(r.term, s);
  }
  return { from, to, byTerm };
}

/** Terms with the most visitors that the app does not follow yet: candidates proven by real searches. */
export function untrackedTopTerms(stats: OfficialStats, tracked: Set<string>, limit = 10): ({ term: string } & OfficialTermStats)[] {
  if (!stats) return [];
  return [...stats.byTerm.entries()]
    .filter(([term]) => !tracked.has(term))
    .map(([term, s]) => ({ term, ...s }))
    .sort((a, b) => b.visitors - a.visitors || b.acquisitions - a.acquisitions || a.term.localeCompare(b.term))
    .slice(0, limit);
}
