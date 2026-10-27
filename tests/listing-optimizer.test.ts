import { describe, expect, it } from "vitest";
import {
  brandOf,
  buildListingPrompt,
  cleanKeywordField,
  cleanProposal,
  type ListingOutput,
  proposalFeedback,
  rankKeywords,
} from "@/lib/listing-optimizer";

const output = (o: Partial<ListingOutput>): ListingOutput => ({
  title: "",
  subtitle: "",
  keywordField: "",
  shortDescription: "",
  description: "",
  targetKeywords: [],
  changes: [],
  notes: [],
  ...o,
});

const kw = (term: string, o: Partial<Parameters<typeof rankKeywords>[0][number]> = {}) => ({
  term,
  position: null,
  depth: null,
  popularity: null,
  difficulty: null,
  opportunity: null,
  relevance: null,
  ...o,
});

describe("cleanKeywordField", () => {
  it("drops spaces, repeats and words already in the title or subtitle", () => {
    expect(cleanKeywordField("Correr, gps ,maratón,gps, plan semanal", "Runly: Correr", "Plan de entrenamiento")).toBe("gps,maratón,semanal");
  });

  it("cuts at whole words to fit the limit", () => {
    expect(cleanKeywordField("aaaa,bbbb,cccc", "", "", 10)).toBe("aaaa,bbbb");
  });
});

describe("cleanProposal", () => {
  it("keeps the store's fields, fixes the keyword field and flags limits", () => {
    const p = cleanProposal(
      "ios",
      output({
        title: "Runly: Correr  y GPS",
        subtitle: "Plan de entrenamiento para correr tu primer maratón",
        keywordField: "correr,km, ritmo",
        shortDescription: "ignored",
        targetKeywords: ["Correr", "inventada"],
        changes: [
          { field: "title", why: "Añade gps." },
          { field: "shortDescription", why: "No existe en iOS." },
        ],
      }),
      ["correr", "gps"],
    );
    expect(p.fields).toEqual({
      title: "Runly: Correr y GPS",
      subtitle: "Plan de entrenamiento para correr tu primer maratón",
      keywordField: "km,ritmo",
      description: "",
    });
    expect(p.targetKeywords).toEqual(["correr"]);
    expect(p.changes).toEqual([{ field: "title", why: "Añade gps." }]);
    expect(p.over).toEqual(["subtitle"]);
  });

  it("returns Google Play fields only", () => {
    const p = cleanProposal("android", output({ title: "Runly", shortDescription: "Corre más", description: "A\n\n\n\nB  \n", keywordField: "x" }), []);
    expect(p.fields).toEqual({ title: "Runly", shortDescription: "Corre más", description: "A\n\nB" });
  });
});

describe("proposalFeedback", () => {
  it("asks to fix limits and a missing brand", () => {
    const p = cleanProposal("android", output({ title: "Correr con GPS y plan de maratón gratis", shortDescription: "ok" }), []);
    expect(proposalFeedback("android", p, "Runly")).toEqual([
      "title has 39 characters, the limit is 30.",
      'The title must start with the brand "Runly".',
    ]);
  });
});

describe("brandOf", () => {
  it("takes the part before a separator, or the first word", () => {
    expect(brandOf("Runly: Correr y GPS")).toBe("Runly");
    expect(brandOf("Nike Run Club - Running")).toBe("Nike Run Club");
    expect(brandOf("Runly correr")).toBe("Runly");
  });
});

describe("buildListingPrompt", () => {
  it("lists keywords best first with their data", () => {
    const prompt = buildListingPrompt({
      store: "ios",
      countryName: "España",
      lang: "es",
      developer: "Runly SL",
      category: "Salud",
      current: { title: "Runly", subtitle: "", keywordField: "", shortDescription: "", description: "Corre." },
      keywords: [kw("gps"), kw("correr", { position: 12, popularity: 60, opportunity: 70 }), kw("maraton", { depth: 100 })],
      avoidBrands: ["strava"],
    });
    expect(prompt).toContain("title (5/30): Runly");
    expect(prompt).not.toContain("shortDescription");
    expect(prompt.indexOf("- correr | position 12")).toBeLessThan(prompt.indexOf("- gps"));
    expect(prompt).toContain("- maraton | position >100");
    expect(prompt).toContain("never use them: strava");
  });
});
