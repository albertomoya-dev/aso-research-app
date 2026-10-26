import { describe, expect, it } from "vitest";
import { MAX_KEYWORDS_PER_BATCH, parseKeywords } from "@/lib/keywords";

describe("parseKeywords", () => {
  it("splits on commas and new lines, normalizes and removes duplicates", () => {
    expect(parseKeywords("App para Correr,  rutas   para correr\nentrenamiento 5k\napp para correr")).toEqual([
      "app para correr",
      "rutas para correr",
      "entrenamiento 5k",
    ]);
  });

  it("drops empty and too long entries", () => {
    expect(parseKeywords(" , \n\n" + "x".repeat(101) + ", ok")).toEqual(["ok"]);
  });

  it("caps the batch size", () => {
    const text = Array.from({ length: 300 }, (_, i) => `kw ${i}`).join(",");
    expect(parseKeywords(text)).toHaveLength(MAX_KEYWORDS_PER_BATCH);
  });
});
