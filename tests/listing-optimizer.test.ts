import { describe, expect, it } from "vitest";
import {
  assessProposal,
  brandOf,
  buildListingPrompt,
  cleanKeywordField,
  cleanProposal,
  finalizeProposal,
  LISTING_PROMPT_VERSION,
  LISTING_SYSTEM_PROMPT,
  type ListingOutput,
  MAX_PROMPT_KEYWORDS,
  pickBest,
  proposalFeedback,
  type ListingPromptInput,
  qualityFeedback,
  rankKeywords,
} from "@/lib/listing-optimizer";
import { factsForPrompt, type ProductFeature } from "@/lib/product-facts";
import listingV2 from "./fixtures/recordatorio/listing-v2.json";
import product from "./fixtures/recordatorio/product.json";
import observed from "./fixtures/recordatorio/proposal-observed.json";

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
    // Retired and planned features only appear in the "Do NOT mention" line.
    const lines = factsSection(prompt).split("\n");
    const doNot = lines.filter((l) => l.startsWith("Do NOT mention")).join("\n");
    const rest = lines.filter((l) => !l.startsWith("Do NOT mention")).join("\n");
    expect(doNot).toContain("Protección contra doble toma");
    expect(doNot).toContain("Modo cuidador");
    expect(rest).not.toContain("doble toma");
    expect(rest).not.toContain("Modo cuidador");
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

describe("buildListingPrompt: coverage and DO NOT LOSE (lst-3)", () => {
  const input = (keywords: ReturnType<typeof kw>[]): ListingPromptInput => ({
    store: "android",
    countryName: "España",
    lang: "es",
    developer: "Yo",
    category: null,
    current: { title: "Runly: correr", subtitle: "", keywordField: "", shortDescription: "Plan de maratón", description: "Corre con GPS de noche." },
    keywords,
    avoidBrands: [],
    facts: null,
  });

  it("says where each keyword is covered today and lists the most valuable covered ones", () => {
    const prompt = buildListingPrompt(input([kw("correr", { opportunity: 50 }), kw("plan maraton", { opportunity: 70 }), kw("gps noche", { opportunity: 30 }), kw("natacion", { opportunity: 90 })]));
    expect(LISTING_PROMPT_VERSION).toBe("lst-3");
    expect(prompt).toContain("- correr | position – | popularity – | difficulty – | opportunity 50 | relevance – | today: title");
    expect(prompt).toContain("- gps noche | position – | popularity – | difficulty – | opportunity 30 | relevance – | today: words only, not the phrase");
    expect(prompt).toContain("- natacion | position – | popularity – | difficulty – | opportunity 90 | relevance – | today: not covered");
    const keep = prompt.slice(prompt.indexOf("DO NOT LOSE"));
    expect(keep.indexOf("- plan maraton (today: words only")).toBeLessThan(keep.indexOf("- correr (today: title)"));
    expect(keep).not.toContain("natacion");
  });

  it("sends up to 150 keywords, not 60", () => {
    const many = Array.from({ length: 200 }, (_, i) => kw(`keyword ${i}`, { opportunity: i }));
    const lines = buildListingPrompt(input(many)).split("\n").filter((l) => l.startsWith("- keyword "));
    expect(MAX_PROMPT_KEYWORDS).toBe(150);
    expect(lines).toHaveLength(150);
    expect(lines[0]).toContain("keyword 199");
  });

  it("asks for 2–3 repetitions, aligned with the density rule", () => {
    expect(LISTING_SYSTEM_PROMPT).toContain("repeated 2 to 3 times across the text, never more than 3 times each");
    expect(LISTING_SYSTEM_PROMPT).toContain("DO NOT LOSE");
  });
});

describe("quality lock (real case)", () => {
  const current = listingV2.draft;
  const keywords = [
    { term: "recordatorio pastillas", opportunity: 54 },
    { term: "pastillero digital", opportunity: 45 },
    { term: "alarmas de medicamentos", opportunity: 48 },
    { term: "control de tu tratamiento", opportunity: 42 },
    { term: "copia de seguridad", opportunity: 44 },
    { term: "tema oscuro", opportunity: 41 },
    { term: "sin anuncios", opportunity: 20 },
    { term: "recordatorio de pastillas", opportunity: 50 },
  ];
  const policy = { lang: "es", category: "Medicina", keywords: keywords.map((k) => k.term) };
  const proposalFrom = (fields: Record<string, string>) => cleanProposal("android", output(fields), []);

  it("a proposal that loses high-opportunity keywords gets concrete feedback", () => {
    const bad = proposalFrom(observed.fields);
    const a = assessProposal("android", current, bad, keywords, policy);
    expect(a.scoreAfter).toBeLessThan(a.scoreBefore);
    expect(a.regressed).toBe(true);
    // "Copia de seguridad" and "tema claro y oscuro" disappear; "alarmas de medicamentos" survives as loose words.
    expect(a.lostImportant.map((l) => l.term)).toEqual(["copia de seguridad", "tema oscuro"]);
    const feedback = qualityFeedback(a);
    expect(feedback[0]).toMatch(/^Weighted keyword coverage dropped from [\d.]+ to [\d.]+/);
    expect(feedback[1]).toContain('"copia de seguridad" (was in description), "tema oscuro" (was in loose words)');
  });

  it("sends policy errors as feedback", () => {
    const promo = proposalFrom({ ...current, title: "Recordatorio pastillas gratis" });
    const a = assessProposal("android", current, promo, keywords, policy);
    expect(a.policyErrors.map((e) => e.ruleId)).toEqual(["play.title.promo"]);
    expect(qualityFeedback(a).at(-1)).toMatch(/^Store policy error \(play\.title\.promo\):/);
  });

  it("an equal or better proposal needs no feedback", () => {
    const same = proposalFrom(current);
    const a = assessProposal("android", current, same, keywords, policy);
    expect(a).toMatchObject({ regressed: false, policyErrors: [] });
    expect(qualityFeedback(a)).toEqual([]);
  });

  it("keeps the best attempt and flags it when it is still worse", () => {
    const first = proposalFrom(observed.fields);
    const second = proposalFrom({ ...observed.fields, shortDescription: current.shortDescription });
    const attempts = [first, second].map((proposal) => ({ proposal, assessment: assessProposal("android", current, proposal, keywords, policy) }));
    const best = pickBest(attempts);
    expect(best.proposal).toBe(second);
    // Retrying again in the other order still picks the better one.
    expect(pickBest([attempts[1], attempts[0]]).proposal).toBe(second);
    const final = finalizeProposal(best, 2);
    expect(final).toMatchObject({ attempts: 2, regression: true, scoreBefore: best.assessment.scoreBefore, scoreAfter: best.assessment.scoreAfter });
    expect(final.diff?.lost.map((l) => l.term)).toContain("copia de seguridad");
  });

  it("prefers a proposal within the limits over a higher score", () => {
    const over = proposalFrom({ ...current, title: `${current.title} con alarma de medicamentos y más` });
    const ok = proposalFrom(current);
    const attempts = [over, ok].map((proposal) => ({ proposal, assessment: assessProposal("android", current, proposal, keywords, policy) }));
    expect(pickBest(attempts).proposal).toBe(ok);
  });
});
