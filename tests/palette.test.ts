import { describe, expect, it } from "vitest";
import { paletteFromPixels } from "@/lib/assets/palette";

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
