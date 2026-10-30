import { describe, expect, it } from "vitest";
import {
  buildUserPrompt,
  competitorBrands,
  filterSuggestions,
  MAX_SUGGESTIONS,
  relevanceFactor,
  seedWords,
} from "@/lib/suggestions";

const item = (keyword: string, extra: Partial<Record<string, unknown>> = {}) => ({
  keyword,
  language: "es",
  intent: "feature",
  relevance: 4,
  estimatedCompetition: "medium",
  reason: "Encaja con la app.",
  ...extra,
});

describe("competitorBrands", () => {
  it("takes the part before the separator and the developer without legal suffix", () => {
    const brands = competitorBrands(
      [
        { title: "Strava: Run & Ride", developer: "Strava Inc." },
        { title: "Nike Run Club - Running", developer: "Nike, Inc." },
        { title: "Running Tracker", developer: "Fit Apps Ltd" },
        { title: "Runtastic", developer: "adidas Runtastic GmbH" },
      ],
      "Mi Empresa S.L.",
    );
    expect(brands).toEqual(expect.arrayContaining(["strava", "nike run club", "nike", "fit apps", "runtastic", "adidas runtastic"]));
    // A generic multi-word title without separator is not a brand.
    expect(brands).not.toContain("running tracker");
  });

  it("does not treat our own developer as a competitor brand", () => {
    expect(competitorBrands([{ title: "Otra app: algo", developer: "Mi Empresa S.L." }], "Mi Empresa SL")).not.toContain("mi empresa");
  });
});

describe("filterSuggestions", () => {
  it("normalizes, validates and drops duplicates, tracked keywords and brands", () => {
    const { kept, dropped } = filterSuggestions(
      {
        suggestions: [
          item("  Correr  Por La Mañana "),
          item("contador de pasos"),
          item("contador de paso"),
          item("app correr"),
          item("strava gratis"),
          item("x"),
          item("plan de carrera", { relevance: 9 }),
          item("entreno", { intent: "otro", estimatedCompetition: "enorme" }),
        ],
      },
      ["App Correr"],
      ["strava"],
    );
    expect(kept.map((k) => k.keyword)).toEqual(["correr por la mañana", "contador de pasos", "entreno"]);
    expect(kept[2]).toMatchObject({ intent: "long-tail", estimatedCompetition: "medium" });
    expect(dropped).toEqual([
      { keyword: "contador de paso", why: "duplicate" },
      { keyword: "app correr", why: "existing" },
      { keyword: "strava gratis", why: "brand" },
      { keyword: "x", why: "invalid" },
      { keyword: "plan de carrera", why: "invalid" },
    ]);
  });

  it("matches brands as whole words only", () => {
    const { kept } = filterSuggestions({ suggestions: [item("nikel"), item("ropa nike")] }, [], ["nike"]);
    expect(kept.map((k) => k.keyword)).toEqual(["nikel"]);
  });

  it("caps the number of suggestions", () => {
    const many = Array.from({ length: MAX_SUGGESTIONS + 10 }, (_, i) => item(`keyword numero ${i}`));
    expect(filterSuggestions({ suggestions: many }, [], []).kept).toHaveLength(MAX_SUGGESTIONS);
  });
});

describe("seedWords", () => {
  it("uses the tagline after the brand, plus the category", () => {
    expect(seedWords("Runly: Correr y Entrenar", "Salud y forma física")).toEqual(["correr", "entrenar", "salud", "forma"]);
  });
  it("uses the whole title when there is no separator", () => {
    expect(seedWords("Contador de Calorías", null)).toEqual(["contador", "calorias"]);
  });
});

describe("relevanceFactor", () => {
  it("maps 1–5 to 0.6–1 and counts unrated keywords as 0.7", () => {
    expect(relevanceFactor(null)).toBe(0.7);
    expect(relevanceFactor(undefined)).toBe(0.7);
    expect(relevanceFactor(2)).toBeCloseTo(0.7);
    expect(relevanceFactor(5)).toBe(1);
    expect(relevanceFactor(1)).toBeCloseTo(0.6);
    expect(relevanceFactor(9)).toBe(1);
  });
});

describe("buildUserPrompt", () => {
  it("includes the listing and the real signals", () => {
    const prompt = buildUserPrompt({
      store: "android",
      countryName: "España",
      lang: "es",
      meta: { title: "Runly", developer: "Yo", category: "Salud", shortDescription: "Corre más", description: "Larga" },
      existing: ["correr"],
      rejected: ["maratón"],
      autocomplete: ["correr 5k"],
      competitors: [{ title: "Strava", developer: "Strava Inc." }],
      focus: "principiantes",
      facts: null,
    });
    expect(prompt).not.toContain("PRODUCT FACTS");
    expect(prompt).toContain("Google Play, country: España");
    expect(prompt).toContain("Short description: Corre más");
    expect(prompt).toContain("Keywords already tracked: correr");
    expect(prompt).toContain("rejected before: maratón");
    expect(prompt).toContain("Strava (Strava Inc.)");
    expect(prompt).toContain("focused on: principiantes");
  });
});

describe("buildUserPrompt with PRODUCT FACTS", () => {
  it("adds the facts and marks the listing as possibly outdated", () => {
    const prompt = buildUserPrompt({
      store: "android",
      countryName: "España",
      lang: "es",
      meta: { title: "Runly", developer: "Yo", category: "Salud", shortDescription: "", description: "Larga", version: "2.0", releaseNotes: "Arreglos" },
      existing: [],
      rejected: [],
      autocomplete: [],
      competitors: [],
      facts: "PRODUCT FACTS (test):\n- Planes de maratón",
    });
    expect(prompt).toContain("App listing (may be outdated");
    expect(prompt).toContain("Published version: 2.0. Release notes: Arreglos");
    expect(prompt).toContain("- Planes de maratón");
  });
});
