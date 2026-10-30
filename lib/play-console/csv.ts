import { normalizeKeyword } from "../keywords";

// Search terms exported from Google Play Console, the one figure no outside tool has: real store listing
// visitors and acquisitions per search term. Two sources are accepted:
//
// 1. The monthly "Store performance" report in the Cloud Storage bucket (Play Console › Download
//    reports › Statistics), file store_performance_[package]_[yyyyMM]_traffic_source.csv, columns:
//    Date, Package name, Traffic source, Search term, UTM source, UTM campaign, Store listing acquisitions,
//    Store listing visitors, Store listing conversion rate. Encoded in UTF-16, one row per day.
//    Spec: https://support.google.com/googleplay/android-developer/answer/6135870 — read on 2026-10-30.
// 2. The CSV downloaded from the Play Console screens (Store analysis › search terms), which may be
//    UTF-8, use the console's language for the headers (Spanish or English) and have no date column.
//
// Headers are matched loosely (lower case, no accents, by keywords), so both shapes parse.

export type SearchTermRow = { date: string | null; term: string; visitors: number; acquisitions: number };
export type ParsedSearchTerms = {
  rows: SearchTermRow[];
  /** Rows without a term, or Play's "Other" bucket for terms under its privacy threshold. */
  skipped: number;
  hasDates: boolean;
  /** Earliest and latest date in the file (null without a date column). */
  from: string | null;
  to: string | null;
};

export class CsvFormatError extends Error {}

/** Bytes of an uploaded CSV → text. Handles UTF-16 LE/BE (with or without BOM) and UTF-8 (with or without BOM). */
export function decodeCsv(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return utf16be(bytes.subarray(2));
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder("utf-8").decode(bytes.subarray(3));
  // No BOM: ASCII-heavy UTF-16 has a zero in every other byte.
  const sample = bytes.subarray(0, Math.min(bytes.length, 400));
  let evenZeros = 0;
  let oddZeros = 0;
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] !== 0) continue;
    if (i % 2 === 0) evenZeros++;
    else oddZeros++;
  }
  const half = sample.length / 2;
  if (oddZeros > half * 0.3 && oddZeros > evenZeros * 4) return new TextDecoder("utf-16le").decode(bytes);
  if (evenZeros > half * 0.3 && evenZeros > oddZeros * 4) return utf16be(bytes);
  return new TextDecoder("utf-8").decode(bytes);
}

function utf16be(bytes: Uint8Array): string {
  const swapped = new Uint8Array(bytes.length - (bytes.length % 2));
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    swapped[i] = bytes[i + 1];
    swapped[i + 1] = bytes[i];
  }
  return new TextDecoder("utf-16le").decode(swapped);
}

/**
 * The delimiter used most in one of the first lines, outside quotes: comma, semicolon (Spanish Excel) or
 * tab. Several lines are looked at because console exports can start with a title line.
 */
export function detectDelimiter(text: string): string {
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  for (const line of text.split(/\r?\n/, 10)) {
    const here: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
    let quoted = false;
    for (const ch of line) {
      if (ch === '"') quoted = !quoted;
      else if (!quoted && ch in here) here[ch]++;
    }
    for (const d of Object.keys(counts)) counts[d] = Math.max(counts[d], here[d]);
  }
  const [best, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return count > 0 ? best : ",";
}

/** RFC 4180 parsing: quoted cells, "" for a quote, line breaks inside quotes. Empty lines are dropped. */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

const fold = (s: string) =>
  s
    .replace(/^﻿/, "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

type Column = "date" | "term" | "visitors" | "acquisitions";

/** Which column a header is, in English or Spanish. Conversion rates are never counted as visitors. */
export function classifyHeader(header: string): Column | null {
  const h = fold(header);
  if (/conver|rate|tasa|porcentaje|%/.test(h)) return null;
  if (/^(date|fecha|dia|day)$/.test(h)) return "date";
  if (/search term|termino|keyword|palabra clave|busqueda$/.test(h) && !/fuente|source|origen/.test(h)) return "term";
  if (/visit/.test(h)) return "visitors";
  if (/acquisition|adquisici|installer|instalac|install/.test(h)) return "acquisitions";
  return null;
}

/** "1,234", "1.234", "1 234" → 1234. Empty or "-" → 0. */
export function parseCount(raw: string): number {
  const digits = raw.replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}

/** "2026-09-01", "2026/09/01", "20260901" or "01/09/2026" (day first, as in Spain) → "2026-09-01". Otherwise null. */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return iso(m[1], m[2], m[3]);
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return iso(m[1], m[2], m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return iso(m[3], m[2], m[1]);
  return null;
}

function iso(y: string, mo: string, d: string): string | null {
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (date.getUTCMonth() !== Number(mo) - 1 || date.getUTCDate() !== Number(d)) return null;
  return date.toISOString().slice(0, 10);
}

/** Play's bucket for terms under its privacy threshold, in either language. */
const OTHER = new Set(["other", "others", "otro", "otros", "(other)", "(otros)"]);

/**
 * Reads a Play Console search terms CSV. Finds the header row in the first lines (UI exports can start
 * with a title), sums repeated rows of the same term and day (the traffic source report splits by UTM),
 * and skips empty terms and «Other». Throws CsvFormatError, in Spanish, when no term or count column exists.
 */
export function parseSearchTermsCsv(bytes: Uint8Array): ParsedSearchTerms {
  const table = parseCsv(decodeCsv(bytes));
  let headerIndex = -1;
  let columns: Partial<Record<Column, number>> = {};
  for (let i = 0; i < Math.min(table.length, 10); i++) {
    const found: Partial<Record<Column, number>> = {};
    table[i].forEach((h, j) => {
      const kind = classifyHeader(h);
      if (kind && found[kind] === undefined) found[kind] = j;
    });
    if (found.term !== undefined && (found.visitors !== undefined || found.acquisitions !== undefined)) {
      headerIndex = i;
      columns = found;
      break;
    }
  }
  if (headerIndex < 0) {
    throw new CsvFormatError(
      "No encuentro las columnas del término de búsqueda y de visitantes o adquisiciones. Sube el CSV de términos de búsqueda de Play Console (o el informe store_performance_…_traffic_source.csv).",
    );
  }

  const sums = new Map<string, SearchTermRow>();
  let skipped = 0;
  for (const cells of table.slice(headerIndex + 1)) {
    const term = normalizeKeyword(cells[columns.term!] ?? "");
    if (!term || OTHER.has(term)) {
      skipped++;
      continue;
    }
    const date = columns.date !== undefined ? parseDate(cells[columns.date] ?? "") : null;
    const key = `${date ?? ""}|${term}`;
    const prev = sums.get(key) ?? { date, term, visitors: 0, acquisitions: 0 };
    prev.visitors += columns.visitors !== undefined ? parseCount(cells[columns.visitors] ?? "") : 0;
    prev.acquisitions += columns.acquisitions !== undefined ? parseCount(cells[columns.acquisitions] ?? "") : 0;
    sums.set(key, prev);
  }
  const rows = [...sums.values()];
  const dates = rows.flatMap((r) => (r.date ? [r.date] : [])).sort();
  const hasDates = dates.length > 0 && dates.length === rows.length;
  return { rows, skipped, hasDates, from: dates[0] ?? null, to: dates.at(-1) ?? null };
}
