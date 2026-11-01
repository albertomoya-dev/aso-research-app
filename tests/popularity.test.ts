import { describe, expect, it, vi } from "vitest";
import { discoveryPrefixes, mergeSuggestions } from "@/lib/discover";
import {
  autocompletePrefixes,
  autocompleteScore,
  difficultyScore,
  MAX_AUTOCOMPLETE_REQUESTS,
  measureAutocomplete,
  opportunityScore,
  scoreLength,
} from "@/lib/popularity";
import { FULL_TERM_POPULARITY_SINCE, MAX_REMEASURE_PER_RUN, pickRemeasures, popularityIsStale } from "@/lib/tracking";
import { parseHints } from "@/lib/stores/ios";
import type { AppSummary } from "@/lib/stores/types";
import { parseTrendsJson, toPoints } from "@/lib/trends";

/** A one-word keyword of `n` letters. */
const word = (n: number) => "x".repeat(n);
const LONG = "recordatorio de medicamentos para personas may"; // 46 letters

describe("autocompleteScore", () => {
  it("is highest when suggested first after one letter", () => {
    expect(autocompleteScore(1, 0, word(10))).toBe(100);
  });

  it("drops with each letter typed and with the position in the list", () => {
    expect(autocompleteScore(5, 0, word(10))).toBe(60);
    expect(autocompleteScore(5, 4, word(10))).toBe(48);
    expect(autocompleteScore(10, 0, word(10))).toBe(10);
  });

  it("never returns 0 for a suggested keyword", () => {
    expect(autocompleteScore(12, 10, word(12))).toBeGreaterThanOrEqual(1);
    expect(autocompleteScore(LONG.length, 10, LONG)).toBeGreaterThanOrEqual(1);
  });
});

describe("measureAutocomplete", () => {
  it("stops at the first prefix that suggests the keyword", async () => {
    const suggest = vi.fn(async (prefix: string) => (prefix.length >= 3 ? ["otra cosa", "App Para Correr"] : ["algo"]));
    const result = await measureAutocomplete("app para correr", suggest);
    expect(result).toEqual({ popularity: autocompleteScore(3, 1, "app para correr"), prefixLength: 3, requests: 3 });
    expect(suggest).toHaveBeenLastCalledWith("app");
  });

  it("skips prefixes ending in a space and gives up after typing the whole keyword", async () => {
    const suggest = vi.fn(async () => [] as string[]);
    const result = await measureAutocomplete("app para correr rapido", suggest);
    expect(result.popularity).toBe(0);
    expect(result.prefixLength).toBeNull();
    expect(suggest).not.toHaveBeenCalledWith("app ");
    // 10 letters of «app para c…», «r»/«ra» of «rapido» and the whole keyword.
    expect(suggest).toHaveBeenCalledTimes(13);
    expect(suggest).toHaveBeenCalledWith("app para correr ra");
    expect(suggest).toHaveBeenLastCalledWith("app para correr rapido");
  });

  it("reaches past a first word of 12 letters (H13)", async () => {
    const suggest = vi.fn(async (prefix: string) =>
      prefix.startsWith("recordatorio p") ? ["recordatorio pastillas", "recordatorio pastillas gratis"] : ["recordatorio"],
    );
    const result = await measureAutocomplete("recordatorio pastillas", suggest);
    expect(result.popularity).toBeGreaterThan(0);
    expect(result.prefixLength).toBe(14);
    expect(result.popularity).toBe(autocompleteScore(14, 0, "recordatorio pastillas"));
  });

  it("never sends more than MAX_AUTOCOMPLETE_REQUESTS requests", async () => {
    const suggest = vi.fn(async () => [] as string[]);
    const term = "recordatorio de medicamentos para personas mayores gratis";
    const result = await measureAutocomplete(term, suggest);
    expect(result.requests).toBe(MAX_AUTOCOMPLETE_REQUESTS);
    expect(suggest).toHaveBeenCalledTimes(MAX_AUTOCOMPLETE_REQUESTS);
    expect(suggest).toHaveBeenLastCalledWith(term);
  });
});

describe("autocompletePrefixes", () => {
  it("types short keywords letter by letter, skipping spaces", () => {
    expect(autocompletePrefixes("app gps")).toEqual([1, 2, 3, 5, 6, 7]);
  });

  it("after 12 letters tries two letters of each next word and the whole keyword", () => {
    expect(autocompletePrefixes("recordatorio pastillas")).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 22]);
  });
});

describe("popularityIsStale", () => {
  it("measures again once every keyword over 12 letters measured before the new algorithm", () => {
    const before = new Date(FULL_TERM_POPULARITY_SINCE.getTime() - 86_400_000);
    vi.useFakeTimers({ now: new Date(FULL_TERM_POPULARITY_SINCE.getTime() + 2 * 86_400_000) });
    try {
      // A 0 left by the old 12-letter cap and a value on the old scale.
      expect(popularityIsStale({ popularity: 0, prefixLength: null, popularityAt: before }, "recordatorio pastillas")).toBe(true);
      expect(popularityIsStale({ popularity: 30, prefixLength: 9, popularityAt: before }, "recordatorio pastillas")).toBe(true);
      // Short keywords kept their scale: they wait for the weekly refresh.
      expect(popularityIsStale({ popularity: 0, prefixLength: null, popularityAt: before }, "pastillero")).toBe(false);
      // Measured with the new algorithm: not again until a week later.
      const after = new Date(FULL_TERM_POPULARITY_SINCE.getTime() + 3_600_000);
      expect(popularityIsStale({ popularity: 0, prefixLength: null, popularityAt: after }, "recordatorio pastillas")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  // Review 2026-10-30: a row the new algorithm re-measured before the cutoff kept being picked on every run.
  it("skips rows the new algorithm already measured before the cutoff, when the stored value says so", () => {
    const before = new Date(FULL_TERM_POPULARITY_SINCE.getTime() - 86_400_000);
    vi.useFakeTimers({ now: new Date(FULL_TERM_POPULARITY_SINCE.getTime() - 3_600_000) });
    try {
      const stale = (popularity: number | null, prefixLength: number | null, term = "recordatorio pastillas") =>
        popularityIsStale({ popularity, prefixLength, popularityAt: before }, term);
      // Found after letter 12: only the new algorithm types that far.
      expect(stale(19, 14)).toBe(false);
      expect(stale(1, 22)).toBe(false);
      // Found at 9 letters: 45 is on the new scale (16 letters) only, 33 on the old one (12 letters) only.
      expect(stale(45, 9)).toBe(false);
      expect(stale(33, 9)).toBe(true);
      // Found at the first letter, or with a current scale of 12 letters too: same score either way.
      expect(stale(100, 1)).toBe(false);
      expect(stale(67, 5, "app para correr")).toBe(false);
      // «Not suggested» cannot be told apart: still re-measured (until the cutoff, within the per-run cap).
      expect(stale(0, null)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("is on or after the deploy, and not far beyond it (a late date re-measures ambiguous rows until then)", () => {
    expect(FULL_TERM_POPULARITY_SINCE.getTime()).toBeGreaterThanOrEqual(Date.UTC(2026, 10, 1));
    expect(FULL_TERM_POPULARITY_SINCE.getTime()).toBeLessThanOrEqual(Date.UTC(2026, 10, 1) + 30 * 86_400_000);
  });

  it("keeps a fresh measurement and refreshes a missing or week-old one", () => {
    // A day after the new algorithm, so a fresh row is not a one-time re-measure.
    const now = FULL_TERM_POPULARITY_SINCE.getTime() + 86_400_000;
    vi.useFakeTimers({ now });
    try {
      const recent = new Date(now - 3_600_000);
      expect(popularityIsStale({ popularity: 40, prefixLength: 3, popularityAt: recent }, "recordatorio pastillas")).toBe(false);
      expect(popularityIsStale(undefined, "x")).toBe(true);
      expect(popularityIsStale({ popularity: 40, prefixLength: 3, popularityAt: new Date(now - 8 * 86_400_000) }, "x")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("pickRemeasures", () => {
  it("caps the one-time re-measures per run, oldest first, and leaves weekly refreshes out", () => {
    const day = 86_400_000;
    const now = FULL_TERM_POPULARITY_SINCE.getTime() + 2 * day;
    vi.useFakeTimers({ now });
    try {
      // 30 at 9 letters is a score of the old 12-letter scale.
      const old = (minutes: number) => ({ popularity: 30, prefixLength: 9, popularityAt: new Date(FULL_TERM_POPULARITY_SINCE.getTime() - minutes * 60_000) });
      const candidates = Array.from({ length: MAX_REMEASURE_PER_RUN + 10 }, (_, i) => ({ key: `k${i}`, term: `recordatorio ${i}`, stored: old(i) }));
      candidates.push(
        // Short keyword, week-old row, never measured, measured with the new algorithm: not one-time re-measures.
        { key: "short", term: "pastillero", stored: old(10_000) },
        { key: "weekly", term: "recordatorio semanal", stored: { ...old(0), popularityAt: new Date(now - 8 * day) } },
        { key: "missing", term: "recordatorio nuevo", stored: undefined as never },
        { key: "fresh", term: "recordatorio fresco", stored: { ...old(0), popularityAt: new Date(now - day) } },
      );
      const picked = pickRemeasures(candidates);
      expect(picked.size).toBe(MAX_REMEASURE_PER_RUN);
      // The oldest measurements go first: k34 … k10.
      expect(picked.has(`k${MAX_REMEASURE_PER_RUN + 9}`)).toBe(true);
      expect(picked.has("k0")).toBe(false);
      for (const k of ["short", "weekly", "missing", "fresh"]) expect(picked.has(k)).toBe(false);
      expect(pickRemeasures(candidates, 3)).toEqual(new Set(["k34", "k33", "k32"]));
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("autocompleteScore normalisation", () => {
  it("measures against the keyword up to 12 letters and against its first word + 4 after that", () => {
    expect(scoreLength("pastillero")).toBe(10);
    expect(scoreLength("app para correr")).toBe(12);
    expect(scoreLength("recordatorio pastillas")).toBe(16);
    expect(scoreLength(LONG)).toBe(16);
  });

  it("scores a long keyword suggested halfway above one typed entirely (H13)", () => {
    expect(autocompleteScore(14, 0, "recordatorio pastillas")).toBe(19);
    expect(autocompleteScore(14, 0, "recordatorio pastillas")).toBeGreaterThan(autocompleteScore(22, 0, "recordatorio pastillas"));
    expect(autocompleteScore(22, 0, "recordatorio pastillas")).toBe(1);
  });

  it("does not reward long tail over a head term typed almost entirely", () => {
    // 45+ letters suggested at letter 27 vs 10 letters suggested at letter 8.
    expect(autocompleteScore(27, 0, LONG)).toBeLessThanOrEqual(5);
    expect(autocompleteScore(8, 0, word(10))).toBe(30);
    expect(autocompleteScore(27, 0, LONG)).toBeLessThan(autocompleteScore(8, 0, word(10)));
  });

  it("keeps the old scale for keywords whose first word is short", () => {
    // Before, L = min(length, 12).
    expect(autocompleteScore(5, 0, "app para correr rapido")).toBe(Math.round(100 * (1 - 4 / 12)));
  });

  it("drops monotonically with each letter typed and with the position in the list", () => {
    for (const term of ["pastillero", "recordatorio pastillas", LONG, "x".repeat(20) + " y"]) {
      for (const index of [0, 3, 10]) {
        const scores = Array.from({ length: term.length }, (_, i) => autocompleteScore(i + 1, index, term));
        for (let i = 1; i < scores.length; i++) expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
        expect(Math.min(...scores)).toBeGreaterThanOrEqual(1);
      }
      const byIndex = Array.from({ length: 12 }, (_, i) => autocompleteScore(3, i, term));
      for (let i = 1; i < byIndex.length; i++) expect(byIndex[i]).toBeLessThanOrEqual(byIndex[i - 1]);
    }
  });
});

const app = (title: string, rating: number | null, ratingsCount?: number): AppSummary => ({
  store: "ios",
  id: title,
  title,
  developer: "",
  icon: "",
  rating,
  ratingsCount,
  url: "",
});

describe("difficultyScore", () => {
  it("is 0 with no results", () => {
    expect(difficultyScore([], "correr")).toBe(0);
  });

  it("is high when big, well rated apps target the keyword in their title", () => {
    const top = Array.from({ length: 10 }, (_, i) => app(`Correr ${i}`, 4.8, 500_000));
    expect(difficultyScore(top, "correr")).toBeGreaterThanOrEqual(85);
  });

  it("is low when small apps do not use the keyword", () => {
    const top = Array.from({ length: 10 }, (_, i) => app(`Otra ${i}`, 3, 20));
    expect(difficultyScore(top, "correr")).toBeLessThan(30);
  });

  it("ignores accents and case when matching titles", () => {
    const withAccent = [app("Música para CORRER", 4, 1000)];
    const without = [app("Musica para correr", 4, 1000)];
    expect(difficultyScore(withAccent, "musica correr")).toBe(difficultyScore(without, "música correr"));
  });

  it("works without ratings counts (Google Play)", () => {
    expect(difficultyScore([app("Correr", 5)], "correr")).toBe(100);
  });
});

describe("opportunityScore", () => {
  it("discounts popularity by difficulty and relevance", () => {
    expect(opportunityScore(80, 0)).toBe(80);
    expect(opportunityScore(80, 100)).toBe(24);
    expect(opportunityScore(80, 50, 0.5)).toBe(26);
  });
});

describe("parseHints", () => {
  it("reads the terms from the App Store plist and decodes entities", () => {
    const xml = `<?xml version="1.0"?><plist version="1.0"><dict><key>hints</key><array>
      <dict><key>term</key><string>correr gps</string><key>url</key><string>x</string></dict>
      <dict><key>term</key><string>caf&#233; &amp; correr</string></dict>
    </array></dict></plist>`;
    expect(parseHints(xml)).toEqual(["correr gps", "café & correr"]);
  });
});

describe("discovery", () => {
  it("builds the seed and seed + letter prefixes", () => {
    const prefixes = discoveryPrefixes("  Correr ");
    expect(prefixes).toHaveLength(27);
    expect(prefixes.slice(0, 3)).toEqual(["correr", "correr a", "correr b"]);
  });

  it("merges unique suggestions, without the seed or followed keywords", () => {
    expect(mergeSuggestions([["Correr", "correr gps"], ["correr gps", "correr bien"]], "correr", ["correr bien"])).toEqual(["correr gps"]);
  });
});

describe("Google Trends", () => {
  it("strips the anti-JSON prefix and converts the timeline", () => {
    const body = `)]}',\n{"default":{"timelineData":[{"time":"1760227200","value":[42]}]}}`;
    expect(toPoints(parseTrendsJson(body))).toEqual([{ date: "2025-10-12", value: 42 }]);
  });
});
