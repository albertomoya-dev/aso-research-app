import { describe, expect, it } from "vitest";
import { applyFilters, facetCounts, parseTableView, toggleFacet } from "@/lib/data-table";
import { DEFAULT_KEYWORD_VIEW, keywordFacets, keywordsCsv, legacyFilter, parseKeywordCsv, type TableRow } from "@/lib/keyword-table";

const row = (term: string, extra: Partial<TableRow> = {}): TableRow => ({
  id: term.length,
  term,
  source: "manual",
  relevance: 4,
  relevanceSource: "ai",
  intent: "own",
  position: null,
  depth: 30,
  changeDay: null,
  changeWeek: null,
  popularity: 40,
  difficulty: 50,
  opportunity: 20,
  ...extra,
});

const rows = [
  row("correr", { position: 3, source: "ai" }),
  row("rutas para correr", { position: 18, changeWeek: -2, source: "reviews", difficulty: 20 }),
  row("app de running", { position: null, source: "discover", relevance: null, difficulty: null }),
  row("ahora", { position: 45, relevance: 1, source: "top10", difficulty: 80 }),
];
const facets = keywordFacets<TableRow>("es");
const search = (text: string) => ({ text, of: (r: TableRow) => r.term });
const terms = (list: TableRow[]) => list.map((r) => r.term);

describe("keyword facets", () => {
  it("filters by Estado: TOP 10, Al alcance, Bajando, Fuera", () => {
    expect(terms(applyFilters(rows, facets, { estado: ["top10"] }, search("")))).toEqual(["correr"]);
    expect(terms(applyFilters(rows, facets, { estado: ["reach"] }, search("")))).toEqual(["rutas para correr"]);
    expect(terms(applyFilters(rows, facets, { estado: ["down"] }, search("")))).toEqual(["rutas para correr"]);
    expect(terms(applyFilters(rows, facets, { estado: ["out"] }, search("")))).toEqual(["app de running"]);
  });

  it("ORs the options of one facet and ANDs the facets", () => {
    expect(terms(applyFilters(rows, facets, { estado: ["top10", "out"] }, search("")))).toEqual(["correr", "app de running"]);
    expect(terms(applyFilters(rows, facets, { estado: ["top10", "out"], origen: ["autocomplete"] }, search("")))).toEqual(["app de running"]);
  });

  it("groups Descubrir and the old autocomplete under «Autocompletado», and has Reseñas", () => {
    expect(terms(applyFilters(rows, facets, { origen: ["reviews"] }, search("")))).toEqual(["rutas para correr"]);
    expect(terms(applyFilters(rows, facets, { origen: ["autocomplete"] }, search("")))).toEqual(["app de running"]);
  });

  it("filters by relevance (unrated, likely irrelevant) and difficulty bands", () => {
    expect(terms(applyFilters(rows, facets, { relevancia: ["none"] }, search("")))).toEqual(["app de running"]);
    expect(terms(applyFilters(rows, facets, { relevancia: ["noise"] }, search("")))).toEqual(["ahora"]);
    expect(terms(applyFilters(rows, facets, { dificultad: ["low", "none"] }, search("")))).toEqual(["rutas para correr", "app de running"]);
  });

  it("searches every word, ignoring case and accents", () => {
    expect(terms(applyFilters(rows, facets, {}, search("CÓRRER rutas")))).toEqual(["rutas para correr"]);
  });

  it("counts each option with the other facets applied, not its own", () => {
    const counts = facetCounts(rows, facets, "estado", { estado: ["top10"], origen: ["ai", "reviews"] });
    expect(counts).toEqual({ top10: 1, reach: 1, down: 1, out: 0 });
  });

  it("toggles options and maps the old ?f= links", () => {
    const once = toggleFacet({}, "estado", "top10");
    expect(once).toEqual({ estado: ["top10"] });
    expect(toggleFacet(once, "estado", "top10")).toEqual({ estado: [] });
    expect(legacyFilter("noise")).toEqual({ relevancia: ["noise"] });
    expect(legacyFilter("reach")).toEqual({ estado: ["reach"] });
    expect(legacyFilter("all")).toEqual({});
  });
});

describe("parseTableView", () => {
  const known = ["term", "position", "top5"];
  it("falls back on missing or broken values and drops unknown columns", () => {
    expect(parseTableView(null, known, DEFAULT_KEYWORD_VIEW)).toBe(DEFAULT_KEYWORD_VIEW);
    expect(parseTableView("{oops", known, DEFAULT_KEYWORD_VIEW)).toBe(DEFAULT_KEYWORD_VIEW);
    expect(parseTableView(JSON.stringify({ columns: ["top5", "gone"], density: "compact" }), known, DEFAULT_KEYWORD_VIEW, ["term"])).toEqual({
      columns: ["term", "top5"],
      density: "compact",
    });
  });
});

describe("parseKeywordCsv («Pegar CSV»)", () => {
  it("reads the keyword column by its header and skips the header", () => {
    const out = parseKeywordCsv("Volumen,Keyword,Dificultad\n40,App para correr,20\n25,\"rutas, montaña\",10\n");
    expect(out).toEqual({ terms: ["app para correr", "rutas, montaña"], column: "Keyword", skipped: 0 });
  });

  it("detects semicolons (Excel in Spanish) and tabs (a spreadsheet), and accents in the header", () => {
    expect(parseKeywordCsv("término;volumen\ncorrer;3").terms).toEqual(["correr"]);
    expect(parseKeywordCsv("search term\tvisitors\ncorrer\t10\nCorrer\t4").terms).toEqual(["correr"]);
  });

  it("takes the first column without a known header, ignoring numbers and blanks", () => {
    expect(parseKeywordCsv("correr,1\n\n123,2\nandar,3")).toEqual({ terms: ["correr", "andar"], column: null, skipped: 1 });
  });

  it("handles escaped quotes and line breaks inside quotes", () => {
    expect(parseKeywordCsv('keyword\n"app ""pro"""\n"dos\nlíneas"').terms).toEqual(['app "pro"', "dos\nlíneas".replace(/\s+/g, " ")]);
  });
});

describe("keywordsCsv", () => {
  it("exports the selection with its origin label", () => {
    const csv = keywordsCsv([row("a, b", { position: 4, changeWeek: 2, source: "discover" })]);
    expect(csv.split("\n")).toEqual(["keyword,posicion,variacion_7d,popularidad,dificultad,oportunidad,relevancia,origen", '"a, b",4,2,40,50,20,4,Autocompletado']);
  });
});
