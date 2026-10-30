import { describe, expect, it, vi } from "vitest";
import { discoveryPrefixes, mergeSuggestions } from "@/lib/discover";
import { autocompleteScore, difficultyScore, measureAutocomplete, opportunityScore } from "@/lib/popularity";
import { parseHints } from "@/lib/stores/ios";
import type { AppSummary } from "@/lib/stores/types";
import { parseTrendsJson, toPoints } from "@/lib/trends";

describe("autocompleteScore", () => {
  it("is highest when suggested first after one letter", () => {
    expect(autocompleteScore(1, 0, 10)).toBe(100);
  });

  it("drops with each letter typed and with the position in the list", () => {
    expect(autocompleteScore(5, 0, 10)).toBe(60);
    expect(autocompleteScore(5, 4, 10)).toBe(48);
    expect(autocompleteScore(10, 0, 10)).toBe(10);
  });

  it("never returns 0 for a suggested keyword", () => {
    expect(autocompleteScore(12, 10, 12)).toBeGreaterThanOrEqual(1);
  });
});

describe("measureAutocomplete", () => {
  it("stops at the first prefix that suggests the keyword", async () => {
    const suggest = vi.fn(async (prefix: string) => (prefix.length >= 3 ? ["otra cosa", "App Para Correr"] : ["algo"]));
    const result = await measureAutocomplete("app para correr", suggest);
    expect(result).toEqual({ popularity: autocompleteScore(3, 1, 15), prefixLength: 3, requests: 3 });
    expect(suggest).toHaveBeenLastCalledWith("app");
  });

  it("skips prefixes ending in a space and gives up after 12 letters", async () => {
    const suggest = vi.fn(async () => [] as string[]);
    const result = await measureAutocomplete("app para correr rapido", suggest);
    expect(result.popularity).toBe(0);
    expect(result.prefixLength).toBeNull();
    expect(suggest).not.toHaveBeenCalledWith("app ");
    expect(suggest).toHaveBeenCalledTimes(10);
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
