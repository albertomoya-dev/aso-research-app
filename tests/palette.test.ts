import { describe, expect, it } from "vitest";
import { contrastRatio, luminance } from "@/lib/assets/icon";
import { AA_LARGE, AA_TEXT, ensureContrast, paletteFromPixels, themeFromPalette } from "@/lib/assets/palette";

function image(parts: [number, [number, number, number]][]) {
  const total = parts.reduce((s, [n]) => s + n, 0);
  const px = new Uint8ClampedArray(total * 4);
  let i = 0;
  for (const [n, [r, g, b]] of parts)
    for (let k = 0; k < n; k++, i++) px.set([r, g, b, 255], i * 4);
  return px;
}

describe("paletteFromPixels", () => {
  it("picks the brand colours over the white and grey of the interface", () => {
    const px = image([
      [6000, [250, 250, 252]], // background
      [1500, [40, 40, 44]], // text
      [1200, [30, 110, 92]], // teal brand
      [400, [94, 106, 210]], // indigo accent
      [300, [32, 112, 95]], // same teal, slightly different
    ]);
    const palette = paletteFromPixels([{ pixels: px }]);
    expect(palette[0]).toBe("#1e6e5c");
    expect(palette).toContain("#5e6ad2");
    expect(palette).toHaveLength(2);
  });

  it("falls back to the most frequent colours when the app is all greys", () => {
    const px = image([
      [800, [20, 20, 20]],
      [200, [240, 240, 240]],
    ]);
    expect(paletteFromPixels([{ pixels: px }], 3)).toEqual([
      "#141414",
      "#f0f0f0",
    ]);
  });

  it("weights a source, such as the icon, more", () => {
    const shots = image([[1000, [200, 40, 40]]]);
    const icon = image([[300, [40, 40, 200]]]);
    expect(
      paletteFromPixels([{ pixels: shots }, { pixels: icon, weight: 5 }])[0],
    ).toBe("#2828c8");
  });
});

describe("background prompts with the app palette", () => {
  it("asks Claude to build on the palette and appends it to hand-written prompts", async () => {
    const { buildBackgroundPromptsPrompt, withAppPalette } =
      await import("@/lib/assets/creative-ai");
    const input = {
      store: "android",
      countryName: "España",
      lang: "es",
      meta: {
        title: "Pastillas",
        developer: "Yo",
        category: "Salud",
        shortDescription: "Recordatorio",
        description: "Larga",
      },
      keywords: [],
    } as unknown as Parameters<typeof buildBackgroundPromptsPrompt>[0];
    const text = buildBackgroundPromptsPrompt(input, {
      dark: false,
      background: "#ffffff",
      accent: "#5e6ad2",
      palette: ["#1e6e5c", "#5e6ad2"],
    });
    expect(text).toContain("#1e6e5c, #5e6ad2");
    expect(withAppPalette("A calm gradient", ["#1e6e5c"])).toBe(
      "A calm gradient Use the app's brand colour palette: #1e6e5c.",
    );
    expect(withAppPalette("A calm #1E6E5C gradient", ["#1e6e5c"])).toBe(
      "A calm #1E6E5C gradient",
    );
    expect(withAppPalette("A calm gradient", [])).toBe("A calm gradient");
  });
});

describe("ensureContrast", () => {
  it("moves the lightness until the colour is readable", () => {
    expect(ensureContrast("#ffffff", ["#0f1115"], AA_TEXT)).toBe("#ffffff");
    const fixed = ensureContrast("#8c96ff", ["#7a84f0"], AA_TEXT);
    expect(contrastRatio(fixed, "#7a84f0")).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe("themeFromPalette (H20)", () => {
  const palettes = [
    ["#1e6e5c", "#5e6ad2"], // dark teal
    ["#ff6b4a", "#c62e78"], // bright coral
    ["#ffd166"], // light yellow, one colour
    ["#808080", "#8c96ff"], // the grey in the middle
    ["#5e6ad2", "#5f6bd3"], // second colour too close to the first
    ["#fafafa"],
    ["#050505", "#00ff00"],
  ];

  it.each(palettes)("keeps the headline and subtitle AA (4.5:1) and the accent 3:1 on %s", (...palette) => {
    const theme = themeFromPalette(palette);
    expect(theme).not.toBeNull();
    const t = theme!;
    expect(t.background).toBe(palette[0]);
    for (const bg of [t.background, t.background2]) {
      expect(contrastRatio(t.text, bg)).toBeGreaterThanOrEqual(AA_TEXT);
      expect(contrastRatio(t.subtext, bg)).toBeGreaterThanOrEqual(AA_TEXT);
      expect(contrastRatio(t.accent, bg)).toBeGreaterThanOrEqual(AA_LARGE);
    }
    for (const c of Object.values(t).filter((v) => v.startsWith("#"))) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("uses light text on dark brands and dark text on light ones", () => {
    expect(luminance(themeFromPalette(["#1e6e5c"])!.text)).toBeGreaterThan(0.8);
    expect(luminance(themeFromPalette(["#ffd166"])!.text)).toBeLessThan(0.05);
  });

  // Review finding 10: with one colour the accent fell back to the text colour, so highlighted words vanished.
  it.each(palettes)("keeps the accent distinct from the headline text on %s", (...palette) => {
    const t = themeFromPalette(palette)!;
    expect(t.accent).not.toBe(t.text);
    const [a, b] = [t.accent, t.text].map((c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)));
    const distance = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    expect(contrastRatio(t.accent, t.text) >= 1.5 || distance >= 80).toBe(true);
  });

  it("derives the accent from the brand colour when there is no second one", () => {
    for (const brand of ["#1e6e5c", "#ffd166", "#5e6ad2", "#808080"]) {
      const t = themeFromPalette([brand])!;
      expect(t.accent).not.toBe(t.text);
      expect(contrastRatio(t.accent, t.background)).toBeGreaterThanOrEqual(AA_LARGE);
      expect(contrastRatio(t.accent, t.background2)).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });

  it("takes the second brand colour as the accent", () => {
    expect(themeFromPalette(["#0b3d91", "#ffd166"])!.accent).toBe("#ffd166");
    expect(themeFromPalette([])).toBeNull();
  });
});
