import { describe, expect, it } from "vitest";
import { charCount } from "@/lib/metadata-check";
import {
  buildReleaseNotesPrompt,
  cleanReleaseNotes,
  fitToLimit,
  hasReleaseMaterial,
  RELEASE_NOTES_LIMITS,
  RELEASE_NOTES_PROMPT_VERSION,
  RELEASE_NOTES_SYSTEM_PROMPT,
  type ReleaseNotesInput,
  releaseNotesIssues,
  tidyReleaseNotes,
} from "@/lib/release-notes";
import product from "./fixtures/recordatorio/product.json";

const next = product.features.filter((f) => f.status === "next_release").map((f) => ({ name: f.name, summary: f.summary }));

const input = (o: Partial<ReleaseNotesInput> = {}): ReleaseNotesInput => ({
  store: "android",
  locale: "es-ES",
  brand: "Recordatorio",
  version: "2.5.0",
  features: [{ name: "Escanear el código de barras", summary: "Añade un medicamento escaneando la caja" }],
  latestRelease: { version: "2.4.0", notes: "Mejoras de estabilidad en las alarmas." },
  changelog: "## 2.5.0\n- Escáner de códigos de barras\n- Refactor del módulo de alarmas",
  facts: "PRODUCT FACTS:\nBrand tone: Cercano, claro y tranquilo",
  keywords: ["recordatorio pastillas", "pastillero"],
  ...o,
});

describe("release notes prompt", () => {
  it("has a version, the store limits and the honesty rules", () => {
    expect(RELEASE_NOTES_PROMPT_VERSION).toBe("rn-1");
    expect(RELEASE_NOTES_LIMITS).toEqual({ android: 500, ios: 4000 });
    expect(RELEASE_NOTES_SYSTEM_PROMPT).toMatch(/Never invent features/);
    expect(RELEASE_NOTES_SYSTEM_PROMPT).toMatch(/No markdown/);
  });

  it("includes the features, the latest release, the CHANGELOG, the tone and the keywords", () => {
    const prompt = buildReleaseNotesPrompt(input());
    expect(prompt).toContain("Write the release notes in locale: es-ES. Limit: 500 characters.");
    expect(prompt).toContain("App: Recordatorio, version 2.5.0.");
    expect(prompt).toContain("- Escanear el código de barras: Añade un medicamento escaneando la caja");
    expect(prompt).toContain("Latest declared release (2.4.0)");
    expect(prompt).toContain("Escáner de códigos de barras");
    expect(prompt).toContain("Brand tone: Cercano");
    expect(prompt).toContain("Suggested keywords (use only where natural): recordatorio pastillas, pastillero");
  });

  it("uses the App Store limit and passes the feedback back", () => {
    const prompt = buildReleaseNotesPrompt(input({ store: "ios", keywords: [] }), ["Too long."]);
    expect(prompt).toContain("Limit: 4000 characters.");
    expect(prompt).toContain("(none)");
    expect(prompt).toContain("- Too long.");
  });

  it("works with the next_release features of the fixture", () => {
    expect(next.length).toBeGreaterThan(0);
    expect(buildReleaseNotesPrompt(input({ features: next }))).toContain(next[0].name);
  });

  it("needs something to write about", () => {
    expect(hasReleaseMaterial({ features: [], latestRelease: null, changelog: "  " })).toBe(false);
    expect(hasReleaseMaterial({ features: [], latestRelease: null, changelog: "- fix" })).toBe(true);
    expect(hasReleaseMaterial({ features: [{ name: "x", summary: "" }], latestRelease: null })).toBe(true);
  });
});

describe("cleaning and limits", () => {
  it("turns markdown into store text", () => {
    expect(tidyReleaseNotes("## Novedades\n\n- **Escáner** de cajas\n* Alarmas más fiables  \n\n\n\nGracias")).toBe(
      "Novedades\n\n• Escáner de cajas\n• Alarmas más fiables\n\nGracias",
    );
  });

  it("cuts at the last whole line that fits", () => {
    const text = ["• Primera línea con algo de texto.", "• Segunda línea con algo de texto.", "• Tercera línea con algo de texto."].join("\n");
    const cut = fitToLimit(text, 80);
    expect(cut).toBe("• Primera línea con algo de texto.\n• Segunda línea con algo de texto.");
    expect(fitToLimit("corto", 500)).toBe("corto");
  });

  it("cleanReleaseNotes keeps Google Play within 500 characters and says it trimmed", () => {
    const long = Array.from({ length: 20 }, (_, i) => `• Mejora número ${i + 1} para que no olvides ninguna toma.`).join("\n");
    const r = cleanReleaseNotes("android", { text: long, keywordsUsed: ["pastillero", "pastillero", " "], notes: ["a", "b", "c", "d"] });
    expect(r.trimmed).toBe(true);
    expect(r.length).toBeLessThanOrEqual(500);
    expect(charCount(r.text)).toBe(r.length);
    expect(r.keywordsUsed).toEqual(["pastillero"]);
    expect(r.notes).toHaveLength(3);
    expect(r.issues.some((i) => i.level === "error")).toBe(false);
  });

  it("the App Store allows 4000", () => {
    const text = "• Ahora puedes escanear la caja del medicamento.\n".repeat(20).trim();
    expect(cleanReleaseNotes("ios", { text, keywordsUsed: [], notes: [] }).trimmed).toBe(false);
  });
});

describe("releaseNotesIssues (policy lite)", () => {
  it("flags promo and ranking terms, labelled as notes", () => {
    const issues = releaseNotesIssues("android", "La mejor app, ahora gratis y con descuento.", { lang: "es" });
    const promo = issues.find((i) => i.ruleId === "play.description.promo");
    expect(promo?.text).toMatch(/^Notas:/);
    expect(promo?.text).toMatch(/gratis/);
  });

  it("flags other brands, health claims and prices", () => {
    const issues = releaseNotesIssues("ios", "Como Medisafe, cura la hipertensión. Solo 2,99 €.", {
      lang: "es",
      category: "Medicina",
      brands: ["Medisafe"],
    });
    const ids = issues.map((i) => i.ruleId);
    expect(ids).toEqual(expect.arrayContaining(["other-apps", "health.claims", "ios.description.price"]));
  });

  it("flags the length when the user edits past the limit", () => {
    const issues = releaseNotesIssues("android", "a".repeat(501));
    expect(issues[0]).toMatchObject({ level: "error", text: "Notas: 501 de 500 caracteres, sobran 1." });
  });

  it("is quiet for clean notes", () => {
    expect(releaseNotesIssues("android", "• Ahora puedes escanear la caja del medicamento para añadirlo.", { lang: "es" })).toEqual([]);
  });
});
