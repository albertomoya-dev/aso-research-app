import { describe, expect, it } from "vitest";
import { sortKeywordRows, trendChange } from "@/lib/keyword-sort";

const row = (term: string, position: number | null, extra: Partial<Parameters<typeof sortKeywordRows>[0][number]> = {}) => ({
  term,
  position,
  changeDay: null,
  changeWeek: null,
  history: [],
  popularity: null,
  difficulty: null,
  opportunity: null,
  ...extra,
});

describe("sortKeywordRows", () => {
  const rows = [row("b", 12), row("a", null), row("c", 3), row("d", 12)];

  it("sorts ascending and descending with missing values last", () => {
    expect(sortKeywordRows(rows, "position", "asc").map((r) => r.term)).toEqual(["c", "b", "d", "a"]);
    expect(sortKeywordRows(rows, "position", "desc").map((r) => r.term)).toEqual(["b", "d", "c", "a"]);
  });

  it("sorts terms alphabetically", () => {
    expect(sortKeywordRows(rows, "term", "desc").map((r) => r.term)).toEqual(["d", "c", "b", "a"]);
  });

  it("does not mutate the input", () => {
    sortKeywordRows(rows, "term", "desc");
    expect(rows.map((r) => r.term)).toEqual(["b", "a", "c", "d"]);
  });
});

describe("trendChange", () => {
  it("compares the first known position with the latest", () => {
    expect(trendChange({ position: 4, history: [{ position: null }, { position: 10 }, { position: 4 }] })).toBe(6);
    expect(trendChange({ position: null, history: [{ position: 10 }] })).toBeNull();
    expect(trendChange({ position: 5, history: [] })).toBeNull();
  });
});
