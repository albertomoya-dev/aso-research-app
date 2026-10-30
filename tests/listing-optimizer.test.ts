import { describe, expect, it } from "vitest";
import {
  brandOf,
  buildListingPrompt,
  cleanKeywordField,
  cleanProposal,
  type ListingOutput,
  proposalFeedback,
  type ListingPromptInput,
  rankKeywords,
} from "@/lib/listing-optimizer";
import { factsForPrompt, type ProductFeature } from "@/lib/product-facts";
import listingV2 from "./fixtures/recordatorio/listing-v2.json";
import product from "./fixtures/recordatorio/product.json";

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
      facts: null,
    });
    expect(prompt).toContain("title (5/30): Runly");
    expect(prompt).not.toContain("shortDescription");
    expect(prompt.indexOf("- correr | position 12")).toBeLessThan(prompt.indexOf("- gps"));
    expect(prompt).toContain("- maraton | position >100");
    expect(prompt).toContain("never use them: strava");
  });
});

describe("buildListingPrompt with PRODUCT FACTS (real case)", () => {
  const features = product.features as ProductFeature[];
  const input = (facts: string | null): ListingPromptInput => ({
    store: "android",
    countryName: "España",
    lang: "es",
    developer: listingV2.developer,
    category: listingV2.category,
    current: listingV2.draft,
    keywords: [kw("recordatorio pastillas", { position: 3, opportunity: 80 })],
    avoidBrands: [],
    facts,
    version: listingV2.version,
    releaseNotes: listingV2.releaseNotes,
  });
  const factsSection = (prompt: string) => prompt.slice(prompt.indexOf("PRODUCT FACTS"), prompt.indexOf("Current listing"));

  it("for the next version, describes the barcode scan and not the retired double-dose guard", () => {
    const prompt = buildListingPrompt(input(factsForPrompt(product.facts, features, "next")));
    expect(prompt).toContain("Escanear el código de barras");
    expect(prompt).toContain("reference for tone and wording only");
    expect(prompt).toContain("Published version: 2.4.0");
    // The outdated listing still mentions it; the facts the model must follow do not.
    expect(factsSection(prompt)).not.toContain("doble toma");
    expect(factsSection(prompt)).not.toContain("Modo cuidador");
    expect(factsSection(prompt)).toContain("No hacer afirmaciones médicas");
  });

  it("for the published version, leaves out next_release features", () => {
    const prompt = buildListingPrompt(input(factsForPrompt(product.facts, features, "published")));
    expect(prompt).not.toContain("código de barras");
    expect(prompt).not.toContain("Informe PDF");
    expect(factsSection(prompt)).toContain("Alarmas exactas");
  });

  it("without a product sheet, keeps the prompt as before", () => {
    const prompt = buildListingPrompt(input(null));
    expect(prompt).not.toContain("PRODUCT FACTS");
    expect(prompt).toContain("\nCurrent listing:\n");
    expect(prompt).toContain("Protección contra doble toma");
  });
});
