import { describe, expect, it } from "vitest";
import { diffSides, type DiffPart, wordDiff, wordTokens } from "@/lib/word-diff";

const show = (parts: DiffPart[]) => parts.map((p) => (p.type === "same" ? p.text : p.type === "added" ? `{+${p.text}}` : `[-${p.text}]`)).join("");

describe("wordTokens", () => {
  it("keeps words with accents (composed or decomposed), apostrophes, punctuation and whitespace", () => {
    expect(wordTokens("Recordatório, l'app\n\n¡Ya!")).toEqual(["Recordatório", ",", " ", "l'app", "\n\n", "¡", "Ya", "!"]);
    expect(wordTokens("café ok")).toEqual(["café", " ", "ok"]);
  });
});

describe("wordDiff", () => {
  it("equal texts are one unchanged part", () => {
    expect(wordDiff("Recordatorio de pastillas", "Recordatorio de pastillas")).toEqual([{ type: "same", text: "Recordatorio de pastillas" }]);
    expect(wordDiff("", "")).toEqual([]);
  });

  it("marks added and removed words, removed first", () => {
    const parts = wordDiff("Recordatorio de pastillas", "Recordatorio de medicamentos y pastillas");
    expect(show(parts)).toBe("Recordatorio de {+medicamentos y }pastillas");
    expect(show(wordDiff("Pastillero fácil y gratis", "Pastillero fácil con alarma"))).toBe("Pastillero fácil [-y gratis]{+con alarma}");
  });

  it("an accent change is a change of word, and punctuation is its own token", () => {
    expect(show(wordDiff("Recordatorio medico.", "Recordatorio médico."))).toBe("Recordatorio [-medico]{+médico}.");
    expect(show(wordDiff("Toma, alarma", "Toma; alarma"))).toBe("Toma[-,]{+;} alarma");
  });

  it("whitespace and line breaks survive: both sides rebuild exactly", () => {
    const before = "Primera línea.\n\nSegunda  línea con  dos espacios.\n• Viñeta";
    const after = "Primera línea.\n\nSegunda línea nueva.\n• Viñeta\n• Otra";
    const parts = wordDiff(before, after);
    expect(diffSides(parts)).toEqual({ before, after });
    expect(parts.some((p) => p.type === "same" && p.text.includes("\n\n"))).toBe(true);
  });

  it("from or to empty text", () => {
    expect(wordDiff("", "Nuevo texto")).toEqual([{ type: "added", text: "Nuevo texto" }]);
    expect(wordDiff("Viejo texto", "")).toEqual([{ type: "removed", text: "Viejo texto" }]);
  });

  it("a long description (~4000 characters) diffs fast and exactly", () => {
    const sentence = (i: number) => `Frase número ${i} sobre recordatorios de pastillas, alarmas y tomas diarias.`;
    const beforeText = Array.from({ length: 54 }, (_, i) => sentence(i)).join(" ");
    const afterText = beforeText.replace("Frase número 10", "Línea 10").replace("tomas diarias. Frase número 40", "dosis. Frase 40") + " Final nuevo.";
    expect(beforeText.length).toBeGreaterThan(3900);
    const t0 = performance.now();
    const parts = wordDiff(beforeText, afterText);
    const ms = performance.now() - t0;
    expect(diffSides(parts)).toEqual({ before: beforeText, after: afterText });
    expect(parts.filter((p) => p.type !== "same").length).toBeLessThanOrEqual(8);
    expect(ms).toBeLessThan(500);
  });

  it("a full rewrite of 4000 characters stays under half a second", () => {
    const a = Array.from({ length: 600 }, (_, i) => `palabra${i % 37}`).join(" ");
    const b = Array.from({ length: 600 }, (_, i) => `termino${i % 41}`).join(" ");
    const t0 = performance.now();
    const parts = wordDiff(a, b);
    expect(performance.now() - t0).toBeLessThan(500);
    expect(diffSides(parts)).toEqual({ before: a, after: b });
  });
});
