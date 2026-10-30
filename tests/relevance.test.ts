import { describe, expect, it } from "vitest";
import { factsForPrompt, type ProductFeature } from "@/lib/product-facts";
import {
  buildRelevancePrompt,
  chunk,
  cleanRatings,
  isLikelyIrrelevant,
  isRelevantKeyword,
  type KeywordIntent,
  mergeRatings,
  noiseReason,
  preselect,
  rateable,
  RELEVANCE_BATCH_SIZE,
  type RelevanceContext,
  type RelevanceOutput,
  type StoredRelevance,
} from "@/lib/relevance";
import fixture from "./fixtures/recordatorio/keywords.json";
import listingV2 from "./fixtures/recordatorio/listing-v2.json";
import product from "./fixtures/recordatorio/product.json";

type FixtureKeyword = { term: string; relevance: number | null; intent: KeywordIntent | null; expected: "keep" | "noise" };
const keywords = fixture.keywords as FixtureKeyword[];

const context: RelevanceContext = {
  store: "android",
  countryName: "España",
  lang: "es",
  title: listingV2.draft.title,
  developer: listingV2.developer,
  category: listingV2.category,
  shortDescription: listingV2.draft.shortDescription,
  description: listingV2.draft.description,
  facts: factsForPrompt(product.facts, product.features as ProductFeature[], "next"),
};

describe("buildRelevancePrompt", () => {
  it("includes the product facts, the listing and each keyword with its top results", () => {
    const prompt = buildRelevancePrompt(context, [
      { term: "tomas omitidas", top: ["Thomas y sus amigos", "Thomas & Friends: Magical Tracks"] },
      { term: "recordatorio pastillas", top: [] },
    ]);
    expect(prompt).toContain("PRODUCT FACTS");
    expect(prompt).toContain("Escanear el código de barras");
    expect(prompt).toContain(`Title: ${listingV2.draft.title}`);
    expect(prompt).toContain("Keywords to rate (2)");
    expect(prompt).toContain("- tomas omitidas | top results: Thomas y sus amigos; Thomas & Friends: Magical Tracks");
    expect(prompt.endsWith("\n- recordatorio pastillas")).toBe(true);
  });

  it("falls back to the listing without a product sheet", () => {
    const prompt = buildRelevancePrompt({ ...context, facts: null }, [{ term: "pastillero", top: [] }]);
    expect(prompt).not.toContain("PRODUCT FACTS");
    expect(prompt).toContain("App listing:");
  });
});

describe("chunk", () => {
  it("splits into batches of 100 in order", () => {
    const items = Array.from({ length: 298 }, (_, i) => i);
    const batches = chunk(items);
    expect(batches.map((b) => b.length)).toEqual([RELEVANCE_BATCH_SIZE, RELEVANCE_BATCH_SIZE, 98]);
    expect(batches.flat()).toEqual(items);
    expect(chunk([])).toEqual([]);
  });
});

describe("cleanRatings", () => {
  // Simulated model output: a valid item, one with odd casing, a repeat, an invented keyword and invalid values.
  const output: RelevanceOutput = {
    ratings: [
      { term: "recordatorio pastillas", relevance: 5, intent: "own", reason: "Es exactamente lo que hace la app." },
      { term: "  Tomas  Omitidas ", relevance: 1.6, intent: "foreign", reason: "Buscan dibujos de Thomas." },
      { term: "recordatorio pastillas", relevance: 1, intent: "own", reason: "repetida" },
      { term: "keyword inventada", relevance: 4, intent: "own", reason: "no se pidió" },
      { term: "puedes", relevance: 9, intent: "own", reason: "fuera de rango" },
      { term: "alarma", relevance: 2, intent: "maybe", reason: "Demasiado amplia." },
    ],
  };

  it("keeps one valid rating per keyword asked, normalizing terms and unknown intents", () => {
    const ratings = cleanRatings(output, ["recordatorio pastillas", "tomas omitidas", "puedes", "alarma"]);
    expect(ratings).toEqual([
      { term: "recordatorio pastillas", relevance: 5, intent: "own", reason: "Es exactamente lo que hace la app." },
      { term: "tomas omitidas", relevance: 2, intent: "foreign", reason: "Buscan dibujos de Thomas." },
      { term: "alarma", relevance: 2, intent: "own", reason: "Demasiado amplia." },
    ]);
  });
});

describe("mergeRatings", () => {
  const rows: StoredRelevance[] = [
    { id: 1, term: "recordatorio pastillas", relevance: null, relevanceSource: null },
    { id: 2, term: "alarma", relevance: 5, relevanceSource: "user" },
    { id: 3, term: "tomas omitidas", relevance: 4, relevanceSource: "ai" },
    { id: 4, term: "pastillero", relevance: null, relevanceSource: null },
  ];
  const ratings = cleanRatings(
    {
      ratings: [
        { term: "recordatorio pastillas", relevance: 5, intent: "own", reason: "" },
        { term: "alarma", relevance: 2, intent: "foreign", reason: "" },
        { term: "tomas omitidas", relevance: 1, intent: "foreign", reason: "" },
      ],
    },
    rows.map((r) => r.term),
  );

  it("never overwrites a relevance the user set", () => {
    const updates = mergeRatings(rows, ratings);
    expect(updates.find((u) => u.id === 2)).toBeUndefined();
    expect(updates).toEqual([
      { id: 1, relevance: 5, intent: "own", relevanceSource: "ai" },
      { id: 3, relevance: 1, intent: "foreign", relevanceSource: "ai" },
    ]);
  });

  it("only sends to the model what the user has not rated", () => {
    expect(rateable(rows).map((r) => r.id)).toEqual([1, 3, 4]);
  });
});

describe("noise filter with the real case", () => {
  const noise = keywords.filter((k) => isLikelyIrrelevant(k, "es")).map((k) => k.term);

  it("proposes every noisy keyword from the audit", () => {
    const expected = keywords.filter((k) => k.expected === "noise").map((k) => k.term);
    expect(expected.length).toBeGreaterThanOrEqual(25);
    expect(noise).toEqual(expect.arrayContaining(expected));
  });

  it("never proposes a central phrase", () => {
    const central = keywords.filter((k) => k.expected === "keep").map((k) => k.term);
    expect(central).toEqual(expect.arrayContaining(["recordatorio pastillas", "alarma medicamentos", "pastillero digital", "pastillas recordatorio"]));
    expect(noise.filter((t) => central.includes(t))).toEqual([]);
    expect(central.every((t) => isRelevantKeyword(keywords.find((k) => k.term === t)!, "es"))).toBe(true);
  });

  it("catches filler words even before the AI has rated them", () => {
    for (const term of ["además", "ahora", "puedes", "etc", "com"]) {
      expect(noiseReason({ term, relevance: null, intent: null }, "es"), term).toBe("filler");
    }
    expect(noiseReason({ term: "tomas omitidas", relevance: 2, intent: "foreign" }, "es")).toBe("foreign");
    expect(noiseReason({ term: "móvil", relevance: 2, intent: "own" }, "es")).toBe("low");
    expect(noiseReason({ term: "pastillero", relevance: null, intent: null }, "es")).toBeNull();
  });

  it("leaves unrated keywords in the relevant set and unticks low ones by default", () => {
    expect(isRelevantKeyword({ term: "pastillero", relevance: null, intent: null }, "es")).toBe(true);
    expect(isRelevantKeyword({ term: "pastillero", relevance: 3, intent: "own" }, "es")).toBe(true);
    expect(preselect("pastillero digital", undefined, "es")).toBe(true);
    expect(preselect("pastillero digital", 2, "es")).toBe(false);
    expect(preselect("ahora", undefined, "es")).toBe(false);
  });
});
