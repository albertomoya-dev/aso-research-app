// Generic DataTable logic (pure: no React, no database), shared by the tables of components/ui/data-table.tsx.

/** One option of a faceted filter («TOP 10», «Al alcance»…), with the test a row must pass. */
export type FacetOption<Row> = { id: string; label: string; test: (row: Row) => boolean };

/** A faceted filter: a chip with a list of options. Options of one facet are OR; facets are AND. */
export type Facet<Row> = { id: string; label: string; options: FacetOption<Row>[] };

/** Selected option ids per facet id. A facet with nothing selected does not filter. */
export type FacetSelection = Record<string, readonly string[]>;

/** Whether a row passes every facet with something selected. */
export function passesFacets<Row>(row: Row, facets: readonly Facet<Row>[], selection: FacetSelection, skip?: string): boolean {
  return facets.every((f) => {
    if (f.id === skip) return true;
    const chosen = selection[f.id] ?? [];
    if (chosen.length === 0) return true;
    return f.options.some((o) => chosen.includes(o.id) && o.test(row));
  });
}

/** Rows matching the search text (folded, every word) and every selected facet. */
export function applyFilters<Row>(
  rows: readonly Row[],
  facets: readonly Facet<Row>[],
  selection: FacetSelection,
  search: { text: string; of: (row: Row) => string },
): Row[] {
  const words = foldText(search.text).split(" ").filter(Boolean);
  return rows.filter((r) => {
    if (words.length > 0) {
      const haystack = foldText(search.of(r));
      if (!words.every((w) => haystack.includes(w))) return false;
    }
    return passesFacets(r, facets, selection);
  });
}

/**
 * How many rows each option of a facet would show, given the search and the OTHER facets (the usual
 * faceted count: choosing an option of this facet does not change its own numbers).
 */
export function facetCounts<Row>(rows: readonly Row[], facets: readonly Facet<Row>[], facetId: string, selection: FacetSelection): Record<string, number> {
  const facet = facets.find((f) => f.id === facetId);
  if (!facet) return {};
  const base = rows.filter((r) => passesFacets(r, facets, selection, facetId));
  return Object.fromEntries(facet.options.map((o) => [o.id, base.filter((r) => o.test(r)).length]));
}

/** Toggles one option in a selection (returns a new object). */
export function toggleFacet(selection: FacetSelection, facetId: string, optionId: string): FacetSelection {
  const current = selection[facetId] ?? [];
  const next = current.includes(optionId) ? current.filter((o) => o !== optionId) : [...current, optionId];
  return { ...selection, [facetId]: next };
}

export const activeFacetCount = (selection: FacetSelection) => Object.values(selection).reduce((n, s) => n + s.length, 0);

/** Lower case, no accents, single spaces: what the search box compares. */
export function foldText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export type Density = "comfortable" | "compact";

/** Which columns are shown and how tall the rows are; saved in localStorage per table. */
export type TableView = { columns: string[]; density: Density };

/**
 * A saved view read back from localStorage, or the default when it is missing or broken. Unknown column
 * ids are dropped (a column removed in a later version), and `always` columns are always kept.
 */
export function parseTableView(raw: string | null, known: readonly string[], fallback: TableView, always: readonly string[] = []): TableView {
  if (!raw) return fallback;
  try {
    const value = JSON.parse(raw) as Partial<TableView>;
    const columns = Array.isArray(value.columns) ? value.columns.filter((c): c is string => typeof c === "string" && known.includes(c)) : fallback.columns;
    const density = value.density === "compact" || value.density === "comfortable" ? value.density : fallback.density;
    return { columns: [...new Set([...always, ...columns])].filter((c) => known.includes(c)), density };
  } catch {
    return fallback;
  }
}

/** A CSV cell: quoted when it holds a comma, a quote or a line break. */
export function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
