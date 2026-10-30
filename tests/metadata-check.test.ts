import { describe, expect, it } from "vitest";
import {
  appendToKeywordField,
  charCount,
  checkMetadata,
  keywordDiff,
  type MetadataDraft,
  weightedCoverage,
} from "@/lib/metadata-check";

const draft = (d: Partial<MetadataDraft>): MetadataDraft => ({
  title: "",
  subtitle: "",
  keywordField: "",
  shortDescription: "",
  description: "",
  ...d,
});

describe("checkMetadata (App Store)", () => {
  const ios = draft({ title: "Runly: Correr", subtitle: "Plan de entrenamiento", keywordField: "maraton, 5k,correr,5k" });

  it("flags limits, wasted spaces, repeats and duplicates", () => {
    const report = checkMetadata("ios", { ...ios, subtitle: "Plan de entrenamiento para todos los días" }, []);
    const texts = report.issues.map((i) => i.text);
    expect(report.fields.find((f) => f.key === "subtitle")).toMatchObject({ length: 41, over: true });
    expect(texts[0]).toBe("Subtítulo: 41 de 30 caracteres, sobran 11.");
    expect(texts).toContain("El campo de keywords gasta 1 carácter en espacios junto a las comas.");
    expect(texts).toContain("Ya están en el nombre o el subtítulo, quítalas del campo de keywords: correr.");
    expect(texts).toContain("Palabras repetidas en el campo de keywords: 5k.");
  });

  it("computes coverage across indexed fields, ignoring the description", () => {
    const report = checkMetadata("ios", { ...ios, description: "app para correr de noche" }, [
      "correr",
      "plan entrenamiento",
      "maratón",
      "correr de noche",
    ]);
    expect(report.coverage).toEqual([
      { term: "correr", covered: true, exactIn: "title", inFields: ["title", "keywordField"], missing: [] },
      { term: "plan entrenamiento", covered: true, exactIn: null, inFields: [], missing: [] },
      { term: "maratón", covered: true, exactIn: "keywordField", inFields: ["keywordField"], missing: [] },
      { term: "correr de noche", covered: false, exactIn: null, inFields: [], missing: ["noche"] },
    ]);
    expect(report.missingWords).toEqual(["noche"]);
  });
});

describe("checkMetadata (Google Play)", () => {
  it("indexes the description and counts phrase repeats", () => {
    const report = checkMetadata("android", draft({ title: "Runly", description: `${"correr gratis. ".repeat(7)}` }), ["correr gratis"]);
    expect(report.coverage[0]).toMatchObject({ covered: true, exactIn: "description", descriptionCount: 7 });
    // Repetition is now the policy density rule, with its link to the official text.
    const density = report.issues.find((i) => i.ruleId === "play.description.density");
    expect(density).toMatchObject({ level: "warn", link: expect.stringContaining("support.google.com") });
    expect(density?.text).toContain("correr gratis (7 veces");
    expect(report.missingWords).toEqual([]);
  });
});

describe("checkMetadata with store policies", () => {
  it("merges policy issues, errors first, with rule id and link", () => {
    const report = checkMetadata("android", draft({ title: "Runly 🏃 GRATIS", description: "Corre." }), [], { lang: "es" });
    expect(report.issues[0]).toMatchObject({ level: "error", ruleId: "play.title.emoji" });
    expect(report.issues.map((i) => i.ruleId)).toEqual(expect.arrayContaining(["play.title.promo", "play.title.caps"]));
    expect(report.issues.every((i) => i.link?.startsWith("https://"))).toBe(true);
  });
});

describe("weightedCoverage", () => {
  const kws = [
    { term: "recordatorio pastillas", opportunity: 60 },
    { term: "alarma medicamentos", opportunity: 30 },
    { term: "pastillero", opportunity: null },
  ];

  it("weighs Google Play fields 3/2/1 by opportunity and gives half credit to scattered words", () => {
    const d = draft({ title: "Recordatorio pastillas", shortDescription: "Alarma de medicamentos", description: "Tu pastillero." });
    const c = weightedCoverage("android", d, kws);
    expect(c.items.map((i) => [i.term, i.credit, i.partial])).toEqual([
      ["recordatorio pastillas", 3, false],
      // "alarma de medicamentos" is not the exact phrase: both words in the short description → 0.5 × 2.
      ["alarma medicamentos", 1, true],
      ["pastillero", 1, false],
    ]);
    expect(c.items[2].value).toBe(1); // unmeasured keywords still count a little
    // (60×3 + 30×1 + 1×1) / ((60+30+1)×3) = 211/273
    expect(c.score).toBeCloseTo(77.3, 1);
  });

  it("uses the App Store weights and ignores the description", () => {
    const d = draft({ title: "Pastillas", subtitle: "Recordatorio", keywordField: "pastillero", description: "alarma medicamentos" });
    const c = weightedCoverage("ios", d, kws);
    // Scattered words in title (3) and subtitle (2): 0.8 × 2.
    expect(c.items[0]).toMatchObject({ credit: 1.6, partial: true, fields: [] });
    expect(c.items[1].credit).toBe(0);
    expect(c.items[2]).toMatchObject({ credit: 1.5, fields: ["keywordField"] });
  });

  it("is 0 for nothing and 100 for every keyword in the title", () => {
    expect(weightedCoverage("android", draft({}), kws).score).toBe(0);
    expect(weightedCoverage("android", draft({ title: "x" }), []).score).toBe(0);
    expect(weightedCoverage("android", draft({ title: "pastillero" }), [{ term: "pastillero", opportunity: 50 }]).score).toBe(100);
  });
});

describe("keywordDiff", () => {
  it("lists gained, lost and moved keywords, most valuable first", () => {
    const kws = [
      { term: "recordatorio pastillas", opportunity: 60 },
      { term: "alarma medicamentos", opportunity: 30 },
      { term: "pastillero digital", opportunity: 80 },
      { term: "control tratamiento", opportunity: 50 },
      { term: "suplementos", opportunity: 10 },
    ];
    const before = weightedCoverage(
      "android",
      draft({ title: "Recordatorio pastillas", shortDescription: "Pastillero digital", description: "Control tratamiento y suplementos." }),
      kws,
    );
    const after = weightedCoverage("android", draft({ title: "Pastillero digital", description: "Recordatorio pastillas y alarma medicamentos." }), kws);
    const diff = keywordDiff(before, after);
    expect(diff.gained).toEqual([{ term: "alarma medicamentos", value: 30, from: null, to: "description" }]);
    expect(diff.lost.map((l) => l.term)).toEqual(["control tratamiento", "suplementos"]);
    expect(diff.moved).toEqual([
      { term: "pastillero digital", value: 80, from: "shortDescription", to: "title" },
      { term: "recordatorio pastillas", value: 60, from: "title", to: "description" },
    ]);
  });
});

describe("helpers", () => {
  it("counts characters, not UTF-16 units", () => {
    expect(charCount("🏃 run")).toBe(5);
  });
  it("appends missing words without spaces or duplicates", () => {
    expect(appendToKeywordField("maraton, 5k", ["Maratón", "noche"])).toBe("maraton,5k,noche");
  });
});
