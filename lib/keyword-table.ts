// The keyword table of Keywords › Seguimiento: facets, columns, CSV in and out (pure, client-safe).

import { csvCell, type Facet, type FacetSelection, type TableView } from "./data-table";
import { type KeywordSource, MAX_KEYWORD_LENGTH, MAX_KEYWORDS_PER_BATCH, normalizeKeyword } from "./keywords";
import { rankStatus } from "./ranking";
import { isLikelyIrrelevant } from "./relevance";
import type { KeywordIntent, RelevanceSource } from "./relevance";

/** What the table needs of a row (a subset of lib/queries KeywordRow, so tests can build them). */
export type TableRow = {
  id: number;
  term: string;
  source: KeywordSource;
  relevance: number | null;
  relevanceSource: RelevanceSource | null;
  intent: KeywordIntent | null;
  position: number | null;
  depth: number | null;
  changeDay: number | null;
  changeWeek: number | null;
  popularity: number | null;
  difficulty: number | null;
  opportunity: number | null;
};

/** Origin groups of the «Origen» facet: Descubrir and the old «autocomplete» are both «Autocompletado». */
export const ORIGIN_GROUP: Record<KeywordSource, string> = {
  manual: "manual",
  ai: "ai",
  autocomplete: "autocomplete",
  discover: "autocomplete",
  top10: "top10",
  reviews: "reviews",
};

/** Short origin tag of a row («IA», «Reseñas»…). */
export const ORIGIN_LABEL: Record<string, string> = {
  manual: "Manual",
  ai: "IA",
  autocomplete: "Autocompletado",
  top10: "TOP 10",
  reviews: "Reseñas",
};

export const difficultyBand = (value: number | null) => (value == null ? "none" : value < 35 ? "low" : value < 65 ? "mid" : "high");

/** The four facets of the table. `lang` is the store language (filler words). */
export function keywordFacets<Row extends TableRow>(lang: string): Facet<Row>[] {
  return [
    {
      id: "estado",
      label: "Estado",
      options: [
        { id: "top10", label: "TOP 10", test: (r) => rankStatus(r.position) === "top10" },
        { id: "reach", label: "Al alcance (11–30)", test: (r) => rankStatus(r.position) === "within-reach" },
        { id: "down", label: "Bajando", test: (r) => (r.changeWeek ?? 0) < 0 },
        { id: "out", label: "Fuera", test: (r) => r.position == null },
      ],
    },
    {
      id: "relevancia",
      label: "Relevancia",
      options: [
        ...[5, 4, 3, 2, 1].map((n) => ({ id: String(n), label: `${n} de 5`, test: (r: Row) => r.relevance === n })),
        { id: "none", label: "Sin valorar", test: (r) => r.relevance == null },
        { id: "noise", label: "Probablemente irrelevante", test: (r) => isLikelyIrrelevant(r, lang) },
      ],
    },
    {
      id: "origen",
      label: "Origen",
      options: ["manual", "ai", "reviews", "top10", "autocomplete"].map((id) => ({
        id,
        label: ORIGIN_LABEL[id],
        test: (r: Row) => ORIGIN_GROUP[r.source] === id,
      })),
    },
    {
      id: "dificultad",
      label: "Dificultad",
      options: [
        { id: "low", label: "Baja (0–34)", test: (r) => difficultyBand(r.difficulty) === "low" },
        { id: "mid", label: "Media (35–64)", test: (r) => difficultyBand(r.difficulty) === "mid" },
        { id: "high", label: "Alta (65–100)", test: (r) => difficultyBand(r.difficulty) === "high" },
        { id: "none", label: "Sin datos", test: (r) => r.difficulty == null },
      ],
    },
  ];
}

/** The old `?f=` filters (links in health items, bookmarks) as a facet selection. */
export function legacyFilter(f: string | undefined): FacetSelection {
  switch (f) {
    case "top10":
      return { estado: ["top10"] };
    case "reach":
      return { estado: ["reach"] };
    case "down":
      return { estado: ["down"] };
    case "noise":
      return { relevancia: ["noise"] };
    default:
      return {};
  }
}

/** Columns of the table. `term` is always shown; the rest can be hidden in «Vistas». */
export const KEYWORD_COLUMNS = [
  { id: "term", label: "Keyword" },
  { id: "position", label: "Posición" },
  { id: "week", label: "Variación 7 días" },
  { id: "trend", label: "Evolución 30 días" },
  { id: "popularity", label: "Popularidad" },
  { id: "difficulty", label: "Dificultad" },
  { id: "opportunity", label: "Oportunidad" },
  { id: "relevance", label: "Relevancia editable" },
  { id: "visitors", label: "Visitantes de Play (CSV)" },
  { id: "top5", label: "TOP 5" },
] as const;
export type KeywordColumn = (typeof KEYWORD_COLUMNS)[number]["id"];

export const DEFAULT_KEYWORD_VIEW: TableView = {
  columns: ["term", "position", "trend", "popularity", "difficulty", "opportunity", "top5"],
  density: "comfortable",
};

/** localStorage key of the saved view. */
export const KEYWORD_VIEW_KEY = "rk-keyword-view-v1";

/** CSV of keyword rows («Exportar CSV» of the selection). */
export function keywordsCsv(rows: readonly TableRow[]): string {
  const head = ["keyword", "posicion", "variacion_7d", "popularidad", "dificultad", "oportunidad", "relevancia", "origen"];
  const lines = rows.map((r) =>
    [r.term, r.position, r.changeWeek, r.popularity, r.difficulty, r.opportunity, r.relevance, ORIGIN_LABEL[ORIGIN_GROUP[r.source]]].map(csvCell).join(","),
  );
  return [head.join(","), ...lines].join("\n");
}

/** Header names that hold the keyword in a CSV exported by another tool (folded, compared whole). */
const KEYWORD_HEADERS = ["keyword", "keywords", "palabra clave", "palabras clave", "termino", "term", "search term", "query", "busqueda", "consulta"];

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();

/** Splits CSV text into rows of cells: quotes, escaped quotes («""») and line breaks inside quotes. */
export function parseCsvRows(text: string, delimiter: string): string[][] {
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
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** The delimiter of pasted CSV: tab (a spreadsheet), semicolon (Excel in Spanish) or comma. */
export function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  if (first.includes("\t")) return "\t";
  const semicolons = (first.match(/;/g) ?? []).length;
  const commas = (first.match(/,/g) ?? []).length;
  return semicolons > commas ? ";" : ",";
}

/**
 * Keywords from pasted CSV («Pegar CSV»): the column whose header looks like a keyword (keyword, término,
 * search term…), or the first one; the header row is skipped when recognised. Unique, normalized, at most
 * MAX_KEYWORDS_PER_BATCH, and numbers alone (a stray count column) are ignored.
 */
export function parseKeywordCsv(text: string): { terms: string[]; column: string | null; skipped: number } {
  const rows = parseCsvRows(text, detectDelimiter(text));
  if (rows.length === 0) return { terms: [], column: null, skipped: 0 };
  const header = rows[0].map(fold);
  let index = header.findIndex((h) => KEYWORD_HEADERS.includes(h));
  const hasHeader = index !== -1;
  if (!hasHeader) index = 0;
  const seen = new Set<string>();
  let skipped = 0;
  for (const row of rows.slice(hasHeader ? 1 : 0)) {
    const term = normalizeKeyword(row[index] ?? "");
    if (!term || term.length > MAX_KEYWORD_LENGTH || /^[\d.,%\s]+$/.test(term)) {
      skipped++;
      continue;
    }
    seen.add(term);
  }
  const terms = [...seen];
  return { terms: terms.slice(0, MAX_KEYWORDS_PER_BATCH), column: hasHeader ? rows[0][index].trim() : null, skipped: skipped + Math.max(0, terms.length - MAX_KEYWORDS_PER_BATCH) };
}
