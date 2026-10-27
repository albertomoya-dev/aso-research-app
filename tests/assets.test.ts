import { describe, expect, it } from "vitest";
import { cleanScreenshotCopy, toIconSpec } from "@/lib/assets/creative-ai";
import { checkIcon, contrastRatio, defaultIconSpec, iconSpecSchema, initials } from "@/lib/assets/icon";
import { applyTemplate, DECORS, defaultScreenshotSpec, DEVICE_PRESETS, getTemplate, parseRuns, screenshotSpecSchema, stripMarks, TEMPLATES, wrapWords } from "@/lib/assets/screenshots";
import { buildZip, crc32, listZip } from "@/lib/assets/zip";

describe("parseRuns", () => {
  it("highlights the words between asterisks", () => {
    expect(parseRuns("Corre *sin excusas* hoy")).toEqual([
      { text: "Corre ", accent: false },
      { text: "sin excusas", accent: true },
      { text: " hoy", accent: false },
    ]);
  });

  it("leaves an unmatched asterisk as text", () => {
    expect(parseRuns("5*")).toEqual([{ text: "5*", accent: false }]);
    expect(stripMarks("*a* b*")).toBe("a b");
  });
});

describe("wrapWords", () => {
  // Every character is 10 units wide, so a 100-unit line fits 10 characters.
  const measure = (s: string) => s.length * 10;

  it("breaks greedily at word boundaries and keeps the highlight", () => {
    const lines = wrapWords("Corre *sin excusas* cada día", 100, measure);
    expect(lines.map((l) => l.map((w) => w.text).join(" "))).toEqual(["Corre sin", "excusas", "cada día"]);
    expect(lines[0][1]).toEqual({ text: "sin", accent: true });
  });

  it("never drops a word longer than the line", () => {
    expect(wrapWords("Supercalifragilístico ya", 50, measure).map((l) => l.length)).toEqual([1, 1]);
  });

  it("respects explicit line breaks", () => {
    expect(wrapWords("uno\ndos tres", 1000, measure)).toHaveLength(2);
  });
});

describe("screenshot spec", () => {
  it("builds a valid default from the store screenshots", () => {
    const spec = defaultScreenshotSpec("ios", "Runly: correr", ["/api/assets/image?url=a", "/api/assets/image?url=b"]);
    expect(screenshotSpecSchema.safeParse(spec).success).toBe(true);
    expect(spec.slides).toHaveLength(2);
    expect(spec.slides[0].headline).toBe("*Runly: correr*");
    expect(spec.device).toBe("iphone-6.9");
  });

  it("uses an empty slide when the store has no screenshots", () => {
    expect(defaultScreenshotSpec("android", "X", []).slides).toEqual([expect.objectContaining({ image: null })]);
  });

  it("only has sizes the stores accept (portrait, exact)", () => {
    for (const p of DEVICE_PRESETS) {
      expect(p.height).toBeGreaterThan(p.width);
      if (p.store === "android") expect(p.height / p.width).toBeCloseTo(16 / 9, 1);
    }
  });
});

describe("screenshot templates", () => {
  it("has unique ids and valid styles", () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of TEMPLATES) {
      expect(DECORS).toContain(t.style.decor);
      const spec = applyTemplate(defaultScreenshotSpec("ios", "App", []), t);
      expect(screenshotSpecSchema.safeParse(spec).success).toBe(true);
      expect(spec.template).toBe(t.id);
    }
  });

  it("applies the style to the whole set but keeps the texts and images", () => {
    const base = defaultScreenshotSpec("ios", "App", ["https://a/1.png", "https://a/2.png"]);
    base.slides[0].headline = "Hola *mundo*";
    const spec = applyTemplate(base, getTemplate("duo"));
    expect(spec.pair).toBe(true);
    expect(spec.decor).toBe("circles");
    expect(spec.slides.map((s) => s.image)).toEqual(base.slides.map((s) => s.image));
    expect(spec.slides[0].headline).toBe("Hola *mundo*");
    expect(spec.slides.every((s) => s.layout === "text-top")).toBe(true);
  });

  it("falls back to the first template for an unknown id", () => {
    expect(getTemplate("nope").id).toBe(TEMPLATES[0].id);
  });

  it("still parses designs saved before templates existed", () => {
    const old = {
      version: 1,
      device: "iphone-6.9",
      theme: defaultScreenshotSpec("ios", "App", []).theme,
      deviceScale: 0.8,
      showFrame: true,
      slides: [{ id: "a", headline: "x", subheadline: "", image: null, layout: "text-top", keyword: null }],
    };
    const parsed = screenshotSpecSchema.parse(old);
    expect(parsed.template).toBe("classic");
    expect(parsed.decor).toBe("none");
    expect(parsed.deviceRotate).toBe(0);
    expect(parsed.textScale).toBe(1);
    expect(parsed.pair).toBe(false);
    expect(parsed.backgroundImage).toBeNull();
    expect(parsed.backgroundDim).toBe(0.3);
    expect(parsed.slides[0].asIs).toBe(false);
  });

  it("shows store screenshots as they are by default, and empty slides with the template", () => {
    const spec = defaultScreenshotSpec("ios", "App", ["https://a/1.png"]);
    expect(spec.slides[0].asIs).toBe(true);
    expect(defaultScreenshotSpec("ios", "App", []).slides[0].asIs).toBe(false);
  });

  it("accepts a generated backdrop URL and an as-is slide", () => {
    const spec = defaultScreenshotSpec("ios", "App", ["x"]);
    spec.backgroundImage = "/api/assets/generated/12";
    spec.slides[0].asIs = true;
    expect(screenshotSpecSchema.safeParse(spec).success).toBe(true);
    expect(screenshotSpecSchema.safeParse({ ...spec, backgroundDim: 2 }).success).toBe(false);
  });
});

describe("cleanScreenshotCopy", () => {
  it("caps the slides, fixes odd asterisks and only keeps tracked keywords", () => {
    const copy = cleanScreenshotCopy(
      {
        slides: [
          { headline: "Corre *más.", subheadline: "x", keyword: "correr" },
          { headline: "Dos", subheadline: "y", keyword: "inventada" },
          { headline: "Tres", subheadline: "", keyword: "" },
        ],
        notes: ["a", "b", "c", "d"],
      },
      2,
      ["Correr"],
    );
    expect(copy.slides).toEqual([
      { headline: "Corre más", subheadline: "x", keyword: "correr" },
      { headline: "Dos", subheadline: "y", keyword: "" },
    ]);
    expect(copy.notes).toHaveLength(3);
  });

  it("pads missing slides", () => {
    expect(cleanScreenshotCopy({ slides: [], notes: [] }, 2, []).slides).toHaveLength(2);
  });
});

describe("icons", () => {
  it("takes the first letter of the name, skipping articles", () => {
    expect(initials("La Caixa")).toBe("C");
    expect(initials("runly: correr y gps")).toBe("R");
    expect(initials("")).toBe("A");
  });

  it("has a valid default", () => {
    expect(iconSpecSchema.safeParse(defaultIconSpec("Runly")).success).toBe(true);
  });

  it("measures contrast and flags a faint glyph", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 0);
    const faint = { ...defaultIconSpec("R"), glyphColor: "#6b74d6" };
    expect(checkIcon(faint)[0]).toMatch(/contrasta/);
    expect(checkIcon(defaultIconSpec("R"))).toEqual([]);
  });

  it("repairs a model concept into a valid spec", () => {
    const base = {
      name: "Rayo",
      rationale: "x",
      backgroundKind: "linear" as const,
      backgroundFrom: "#112233",
      backgroundTo: "nope",
      angle: 400,
      glyphKind: "symbol" as const,
      letter: "runly",
      symbol: "Bolt",
      glyphColor: "#ffffff",
      plateKind: "none" as const,
      plateColor: "#ffffff",
      gloss: true,
    };
    const spec = toIconSpec(base, "R");
    expect(spec?.glyph).toEqual({ kind: "symbol", name: "bolt" });
    expect(spec?.background.to).toBe("#112233");
    expect(spec?.background.angle).toBe(360);
    // An unknown symbol falls back to the letters, trimmed to two.
    expect(toIconSpec({ ...base, symbol: "dragon" }, "R")?.glyph).toEqual({ kind: "letter", text: "RU", weight: 800 });
  });
});

describe("zip", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789")).toString(16)).toBe("cbf43926");
  });

  it("writes entries that can be listed back", () => {
    const zip = buildZip([
      { name: "01.png", data: new Uint8Array([1, 2, 3]) },
      { name: "02.png", data: new Uint8Array([4]) },
    ]);
    expect(listZip(zip)).toEqual(["01.png", "02.png"]);
    // Local headers, central directory and end record.
    expect(zip.length).toBe(2 * (30 + 6) + 4 + 2 * (46 + 6) + 22);
  });
});
