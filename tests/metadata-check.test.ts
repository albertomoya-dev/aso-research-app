import { describe, expect, it } from "vitest";
import { appendToKeywordField, charCount, checkMetadata, type MetadataDraft } from "@/lib/metadata-check";

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
      { term: "correr", covered: true, exactIn: "title", missing: [] },
      { term: "plan entrenamiento", covered: true, exactIn: null, missing: [] },
      { term: "maratón", covered: true, exactIn: "keywordField", missing: [] },
      { term: "correr de noche", covered: false, exactIn: null, missing: ["noche"] },
    ]);
    expect(report.missingWords).toEqual(["noche"]);
  });
});

describe("checkMetadata (Google Play)", () => {
  it("indexes the description and counts phrase repeats", () => {
    const report = checkMetadata("android", draft({ title: "Runly", description: `${"correr gratis. ".repeat(7)}` }), ["correr gratis"]);
    expect(report.coverage[0]).toMatchObject({ covered: true, exactIn: "description", descriptionCount: 7 });
    expect(report.issues.at(-1)?.text).toContain("correr gratis");
    expect(report.missingWords).toEqual([]);
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
