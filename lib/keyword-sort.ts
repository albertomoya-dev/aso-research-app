import { positionChange } from "./ranking";

export type SortDir = "asc" | "desc";

type SortableRow = {
  term: string;
  position: number | null;
  changeDay: number | null;
  changeWeek: number | null;
  history: { position: number | null }[];
  popularity: number | null;
  difficulty: number | null;
  opportunity: number | null;
  relevance?: number | null;
};

/** Positions gained over the sparkline window: first known position against the latest one. */
export function trendChange(row: Pick<SortableRow, "position" | "history">): number | null {
  const first = row.history.find((h) => h.position != null)?.position;
  return positionChange(row.position, first);
}

/** Sortable columns of the keyword table, each with the direction a first click uses. */
export const KEYWORD_SORTS = {
  term: { value: (r: SortableRow) => r.term, dir: "asc" },
  position: { value: (r: SortableRow) => r.position, dir: "asc" },
  day: { value: (r: SortableRow) => r.changeDay, dir: "desc" },
  week: { value: (r: SortableRow) => r.changeWeek, dir: "desc" },
  trend: { value: trendChange, dir: "desc" },
  popularity: { value: (r: SortableRow) => r.popularity, dir: "desc" },
  difficulty: { value: (r: SortableRow) => r.difficulty, dir: "asc" },
  opportunity: { value: (r: SortableRow) => r.opportunity, dir: "desc" },
  relevance: { value: (r: SortableRow) => r.relevance ?? null, dir: "desc" },
} as const satisfies Record<string, { value: (r: SortableRow) => string | number | null; dir: SortDir }>;

export type KeywordSort = keyof typeof KEYWORD_SORTS;

export function isKeywordSort(s: string | undefined): s is KeywordSort {
  return s != null && Object.hasOwn(KEYWORD_SORTS, s);
}

/** Sorts a copy of the rows; rows without a value always go last, ties fall back to the term. */
export function sortKeywordRows<T extends SortableRow>(rows: T[], sort: KeywordSort, dir: SortDir): T[] {
  const value = KEYWORD_SORTS[sort].value as (r: T) => string | number | null;
  const sign = dir === "asc" ? 1 : -1;
  return rows.toSorted((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va == null || vb == null) {
      if (va != null) return -1;
      if (vb != null) return 1;
    } else {
      const cmp = typeof va === "string" ? va.localeCompare(vb as string, "es") : va - (vb as number);
      if (cmp !== 0) return cmp * sign;
    }
    return a.term.localeCompare(b.term, "es");
  });
}
