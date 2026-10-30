import { describe, expect, it } from "vitest";
import {
  buildUserPrompt,
  competitorBrands,
  filterSuggestions,
  MAX_SUGGESTIONS,
  relevanceFactor,
  seedWords,
  topCompetitors,
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

describe("competitorBrands with options (real case)", () => {
  // TOP 5 apps of the real case, with generic titles that the old detector took as brands.
  const competitors = [
    { title: "MyTherapy: Recordatorio pastillas", developer: "smartpatient gmbh" },
    { title: "Medisafe Recordatorio Pastillas", developer: "Medisafe Project" },
    { title: "Notas", developer: "Apps Studio" },
    { title: "Control - Diario de salud", developer: "Mobile Apps Ltd" },
    { title: "Recordatorios", developer: "Simple Apps" },
    { title: "Enfermedades: guía médica", developer: "Salud Digital SL" },
    { title: "Recordatorio de pastillas - Alarma", developer: "TOM Apps" },
    { title: "Recordatorio de pastillas - Pills Time", developer: "Pills Time" },
    { title: "Recordatorio de pastillas · Pastillero", developer: "Health Apps" },
    { title: "Notas - Bloc de notas", developer: "Notes Lab" },
    { title: "Notas: diario y listas", developer: "Pocket Apps" },
  ];
  const options = {
    ownTitle: "Recordatorio pastillas y toma",
    trackedTerms: ["recordatorio pastillas", "control de medicamentos", "recordatorios de medicación", "enfermedades crónicas"],
    productTerms: "Alarmas exactas para cada toma. Control de tu tratamiento.",
    lang: "es",
  };

  it("keeps real brands and drops generic words", () => {
    const brands = competitorBrands(competitors, "Moyalo Games", options);
    expect(brands).toEqual(expect.arrayContaining(["mytherapy", "medisafe", "medisafe project", "smartpatient", "pills time"]));
    for (const generic of ["control", "notas", "enfermedades", "recordatorios", "recordatorio de pastillas"]) expect(brands).not.toContain(generic);
    // Developer names made only of generic words are not brands either.
    expect(brands).not.toContain("apps studio");
    expect(brands).not.toContain("simple apps");
  });

  it("an app titled «Notas» does not make «notas» a brand when it is common or tracked", () => {
    // Common: three apps of the set use «notas» in the title.
    expect(competitorBrands(competitors, "Yo", { lang: "es" })).not.toContain("notas");
    // Tracked, even if only one app uses it.
    const one = [{ title: "Notas", developer: "Acme" }];
    expect(competitorBrands(one, "Yo", { lang: "es" })).toContain("notas");
    expect(competitorBrands(one, "Yo", { lang: "es", trackedTerms: ["notas de voz"] })).not.toContain("notas");
  });

  it("respects the user's exceptions", () => {
    expect(competitorBrands(competitors, "Yo", { ...options, exceptions: ["MyTherapy"] })).not.toContain("mytherapy");
  });
});

describe("topCompetitors", () => {
  it("keeps the most frequent apps of the TOP 5, without our own", () => {
    const app = (id: string) => ({ id, title: id, developer: id });
    const rows = [{ top5: [app("a"), app("me"), app("b")] }, { top5: [app("b"), app("c")] }, { top5: [app("b"), app("a")] }];
    expect(topCompetitors(rows, "me", 2).map((a) => a.id)).toEqual(["b", "a"]);
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
