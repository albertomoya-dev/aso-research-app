import { describe, expect, it } from "vitest";
import {
  autocompleteCandidates,
  type Candidate,
  candidatePopularity,
  candidatesCsv,
  estimatePopularity,
  isFindTab,
  mergeCandidates,
  storedCandidates,
} from "@/lib/candidates";
import { autocompleteScore } from "@/lib/popularity";
import { FIND_REDIRECTS } from "@/lib/redirects";

const cand = (term: string, source: Candidate["source"], extra: Partial<Candidate> = {}): Candidate => ({
  term,
  source,
  relevance: null,
  popularityEstimate: null,
  popularityMeasured: null,
  reason: "",
  ...extra,
});

describe("estimatePopularity", () => {
  it("scores the term with the letters typed and its place in the list (autocompleteScore)", () => {
    const lists = [{ prefix: "correr", suggestions: ["correr", "correr por la montaña", "correr 5k"] }];
    expect(estimatePopularity("correr 5k", lists)).toBe(autocompleteScore(6, 2, "correr 5k"));
  });

  it("keeps the best estimate when the term shows up in several lists", () => {
    const lists = [
      { prefix: "correr", suggestions: ["a", "b", "c", "correr 5k"] },
      { prefix: "correr 5", suggestions: ["correr 5k"] },
    ];
    const best = Math.max(autocompleteScore(6, 3, "correr 5k"), autocompleteScore(8, 0, "correr 5k"));
    expect(estimatePopularity("Correr  5K", lists)).toBe(best);
  });

  it("is null when no list has the term (TOP 10, AI ideas)", () => {
    expect(estimatePopularity("nada", [{ prefix: "correr", suggestions: ["correr 5k"] }])).toBeNull();
  });
});

describe("autocompleteCandidates", () => {
  it("lists unique terms in the order found, without the seed, with the first prefix as the reason", () => {
    const out = autocompleteCandidates("Correr", [
      { prefix: "correr", suggestions: ["correr", "Correr 5k", "correr app"] },
      { prefix: "correr a", suggestions: ["correr app", "correr al aire libre"] },
    ]);
    expect(out.map((c) => c.term)).toEqual(["correr 5k", "correr app", "correr al aire libre"]);
    expect(out[2].reason).toContain("«correr a»");
    expect(out.every((c) => c.source === "autocomplete" && c.popularityEstimate != null)).toBe(true);
  });
});

describe("mergeCandidates", () => {
  it("dedupes across sources: the first source keeps the row, later ones fill what is missing", () => {
    const merged = mergeCandidates(
      [
        [cand("correr 5k", "ai", { suggestionId: 7, relevance: 4, reason: "idea" })],
        [cand("Correr 5k", "autocomplete", { popularityEstimate: 40 }), cand("rutas", "autocomplete")],
      ],
      { followed: [], dismissed: [] },
    );
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ term: "correr 5k", source: "ai", suggestionId: 7, relevance: 4, popularityEstimate: 40, reason: "idea" });
  });

  it("never shows followed or dismissed terms, whatever the source", () => {
    const merged = mergeCandidates([[cand("a", "top10"), cand("b", "reviews"), cand("c", "autocomplete")]], {
      followed: ["a"],
      dismissed: ["B"],
    });
    expect(merged.map((c) => c.term)).toEqual(["c"]);
  });

  it("adds the measured popularity of a term, from any stored row", () => {
    const merged = mergeCandidates([[cand("a", "top10", { popularityEstimate: 10 })]], { followed: [], dismissed: [], measured: new Map([["a", 55]]) });
    expect(candidatePopularity(merged[0])).toEqual({ value: 55, estimated: false });
    expect(candidatePopularity(cand("x", "autocomplete", { popularityEstimate: 12 }))).toEqual({ value: 12, estimated: true });
    expect(candidatePopularity(cand("x", "top10"))).toEqual({ value: null, estimated: false });
  });
});

describe("storedCandidates", () => {
  it("is the pending tray: pending rows only, without the AI measurement rows", () => {
    const base = { reason: null, relevance: null, popularityEstimate: null, popularityMeasured: null };
    const out = storedCandidates([
      { ...base, term: "a", source: "reviews", status: "pending" },
      { ...base, term: "b", source: "reviews", status: "dismissed" },
      { ...base, term: "c", source: "ai", status: "pending", popularityMeasured: 3 },
      { ...base, term: "d", source: "autocomplete", status: "followed" },
    ]);
    expect(out.map((c) => c.term)).toEqual(["a"]);
    expect(out[0].reason).toBe("");
  });
});

describe("candidatesCsv", () => {
  it("quotes cells with commas or quotes", () => {
    const csv = candidatesCsv([cand("a, b", "reviews", { reason: 'dice "hola"', relevance: 3 })]);
    expect(csv.split("\n")[1]).toBe('"a, b",Reseñas,3,,,"dice ""hola"""');
  });
});

describe("Encontrar URLs", () => {
  it("knows its tabs", () => {
    expect(isFindTab("ia")).toBe(true);
    expect(isFindTab("descubrir")).toBe(false);
    expect(isFindTab(undefined)).toBe(false);
  });

  it("308s the three old find pages of a market to their source, only under a country", () => {
    expect(FIND_REDIRECTS).toEqual([
      { source: "/a/:app/:market([a-z][a-z])/descubrir", destination: "/a/:app/:market/encontrar?fuente=autocompletado", permanent: true },
      { source: "/a/:app/:market([a-z][a-z])/ideas", destination: "/a/:app/:market/encontrar?fuente=ia", permanent: true },
      { source: "/a/:app/:market([a-z][a-z])/top10", destination: "/a/:app/:market/encontrar?fuente=top10", permanent: true },
    ]);
  });
});
