import { describe, expect, it } from "vitest";
import { applyFade, audioPlan, audioSummary, chooseAudioCodec, chunkRanges, gainAt, isAudioFile } from "@/lib/assets/audio";
import { assignImages, isImageFile, MAX_SLIDES, sortByName, staleSlides } from "@/lib/assets/bulk-upload";
import {
  buildScreenshotCopyContent,
  CREATIVE_PROMPT_VERSION,
  type CreativeInput,
  MAX_VISION_IMAGE_CHARS,
  parseVisionImage,
} from "@/lib/assets/creative-ai";
import { contrastRatio, DEFAULT_ICON_COLORS, defaultIconSpec, iconColorsFromPalette, shade } from "@/lib/assets/icon";
import { blankSlide, defaultScreenshotSpec, screenshotSpecSchema, type Slide } from "@/lib/assets/screenshots";
import type { AppMeta } from "@/lib/stores/types";

const slide = (id: string, patch: Partial<Slide> = {}): Slide => ({ ...blankSlide(), id, ...patch });

describe("screenshot spec: capture date and version", () => {
  it("parses designs saved before the capture fields existed", () => {
    const old = {
      ...defaultScreenshotSpec("android", "App", []),
      slides: [{ id: "a", headline: "x", subheadline: "", image: "data:image/jpeg;base64,AAAA", layout: "text-top", keyword: null, asIs: false, crop: null }],
    };
    const parsed = screenshotSpecSchema.parse(old);
    expect(parsed.slides[0].capturedAt).toBeNull();
    expect(parsed.slides[0].appVersion).toBeNull();
  });

  it("keeps them when present", () => {
    const spec = defaultScreenshotSpec("android", "App", []);
    const withDates = { ...spec, slides: [{ ...spec.slides[0], capturedAt: "2026-10-01T10:00:00.000Z", appVersion: "3.0" }] };
    expect(screenshotSpecSchema.parse(withDates).slides[0]).toMatchObject({ capturedAt: "2026-10-01T10:00:00.000Z", appVersion: "3.0" });
  });
});

describe("bulk upload", () => {
  it("sorts by file name in natural order", () => {
    const files = ["captura 10.png", "captura 2.png", "Captura 1.png", "captura 3.png"].map((name) => ({ name }));
    expect(sortByName(files).map((f) => f.name)).toEqual(["Captura 1.png", "captura 2.png", "captura 3.png", "captura 10.png"]);
  });

  it("recognises images by type or, without one, by extension", () => {
    expect(isImageFile({ name: "a.bin", type: "image/png" })).toBe(true);
    expect(isImageFile({ name: "a.PNG", type: "" })).toBe(true);
    expect(isImageFile({ name: "notas.txt", type: "text/plain" })).toBe(false);
  });

  it("places images on consecutive slides from the selected one and adds slides as needed", () => {
    const slides = [slide("a"), slide("b", { headline: "Hola", asIs: true, crop: { x: 0, y: 0, w: 1, h: 1 } }), slide("c")];
    const images = ["1", "2", "3"].map((n) => ({ image: `img${n}`, capturedAt: "2026-10-30T00:00:00.000Z", appVersion: "3.0" }));
    let made = 0;
    const result = assignImages(slides, 1, images, () => slide(`new${++made}`));
    expect(result.slides.map((s) => s.id)).toEqual(["a", "b", "c", "new1"]);
    expect(result.slides.map((s) => s.image)).toEqual([null, "img1", "img2", "img3"]);
    // Texts stay; a raw capture is never shown "as is" nor with an old crop.
    expect(result.slides[1]).toMatchObject({ headline: "Hola", asIs: false, crop: null, appVersion: "3.0" });
    expect(result.placed).toEqual({ from: 1, to: 3 });
    expect(result.dropped).toBe(0);
  });

  it("never goes past the maximum of slides", () => {
    const slides = Array.from({ length: 8 }, (_, i) => slide(String(i)));
    const images = Array.from({ length: 5 }, (_, i) => ({ image: `img${i}`, capturedAt: null, appVersion: null }));
    const result = assignImages(slides, 7, images, () => slide("x"));
    expect(result.slides).toHaveLength(MAX_SLIDES);
    expect(result.placed).toEqual({ from: 7, to: 9 });
    expect(result.dropped).toBe(2);
  });
});

describe("staleSlides", () => {
  const published = { version: "3.0", updatedAt: "2026-10-15T00:00:00.000Z" };

  it("flags uploaded screenshots taken before the last update or under an older version", () => {
    const slides = [
      slide("old", { image: "a", capturedAt: "2026-09-01T00:00:00.000Z", appVersion: "3.0" }),
      slide("new", { image: "b", capturedAt: "2026-10-20T00:00:00.000Z", appVersion: "3.0" }),
      slide("version", { image: "c", capturedAt: "2026-10-20T00:00:00.000Z", appVersion: "2.4" }),
      slide("store", { image: "/api/assets/image?url=x" }),
      slide("empty", { capturedAt: "2026-01-01T00:00:00.000Z" }),
    ];
    expect(staleSlides(slides, published)).toEqual([0, 2]);
  });

  it("says nothing when the listing has no date nor version", () => {
    expect(staleSlides([slide("a", { image: "a", capturedAt: "2020-01-01T00:00:00.000Z", appVersion: "1" })], { version: null, updatedAt: null })).toEqual([]);
  });
});

describe("icon colours from the current icon", () => {
  it("falls back to the defaults with no palette", () => {
    expect(iconColorsFromPalette([])).toEqual(DEFAULT_ICON_COLORS);
    expect(iconColorsFromPalette(["nope"])).toEqual(DEFAULT_ICON_COLORS);
    expect(defaultIconSpec("Pastillas").background.from).toBe(DEFAULT_ICON_COLORS.from);
  });

  it("starts from the main colour, uses the second for the gradient and picks a readable glyph", () => {
    const teal = iconColorsFromPalette(["#0E7C86", "#F4B942"]);
    expect(teal).toEqual({ from: "#0e7c86", to: "#f4b942", glyphColor: "#ffffff" });
    const spec = defaultIconSpec("Pastillas", teal);
    expect(spec.background).toMatchObject({ from: "#0e7c86", to: "#f4b942" });
  });

  it("shades the main colour when the second is too close, and uses a dark glyph on light colours", () => {
    const light = iconColorsFromPalette(["#ffe066", "#ffe36e"]);
    expect(light.to).toBe(shade("#ffe066", 0.3));
    expect(light.glyphColor).toBe("#0f1115");
    expect(contrastRatio(light.glyphColor, light.from)).toBeGreaterThan(3);
  });
});

describe("video soundtrack", () => {
  it("trims a long track to the video with a fade-out", () => {
    const plan = audioPlan(42, 21, 48_000);
    expect(plan).toEqual({ seconds: 21, frames: 21 * 48_000, fadeStart: 19.5, trimmed: true });
    expect(gainAt(10, plan)).toBe(1);
    expect(gainAt(20.25, plan)).toBeCloseTo(0.5);
    expect(gainAt(21, plan)).toBe(0);
  });

  it("plays a short track once, without fade", () => {
    const plan = audioPlan(10, 21, 48_000);
    expect(plan).toMatchObject({ seconds: 10, trimmed: false, fadeStart: 10 });
    expect(gainAt(9.99, plan)).toBe(1);
    expect(audioSummary(10, 21)).toMatch(/silencio/);
    expect(audioSummary(42, 21)).toBe("Dura 42 s: se corta a 21 s con un fundido de salida de 1,5 s.");
  });

  it("never fades more than half of a very short video", () => {
    const plan = audioPlan(10, 2, 48_000);
    expect(plan.fadeStart).toBe(1);
  });

  it("applies the fade to the samples and cuts them", () => {
    const plan = audioPlan(4, 2, 4, 1);
    const out = applyFade(new Float32Array(16).fill(1), plan, 4);
    expect(out).toHaveLength(8);
    expect(Array.from(out.slice(0, 4))).toEqual([1, 1, 1, 1]);
    expect(out[6]).toBeCloseTo(0.5);
    expect(out[7]).toBeLessThan(out[6]);
  });

  it("splits frames into encoder chunks", () => {
    expect(chunkRanges(10_000, 4096)).toEqual([
      { start: 0, length: 4096 },
      { start: 4096, length: 4096 },
      { start: 8192, length: 1808 },
    ]);
    expect(chunkRanges(0)).toEqual([]);
  });

  it("prefers AAC, then Opus", () => {
    expect(chooseAudioCodec({ aac: true, opus: true })).toBe("aac");
    expect(chooseAudioCodec({ aac: false, opus: true })).toBe("opus");
    expect(chooseAudioCodec({ aac: false, opus: false })).toBeNull();
    expect(isAudioFile({ name: "pista.m4a", type: "" })).toBe(true);
    expect(isAudioFile({ name: "x", type: "audio/mpeg" })).toBe(true);
    expect(isAudioFile({ name: "foto.png", type: "image/png" })).toBe(false);
  });
});

describe("screenshot captions with vision", () => {
  const meta = {
    store: "android",
    id: "x",
    title: "Recordatorio pastillas",
    developer: "Dev",
    icon: "",
    rating: null,
    url: "",
    country: "es",
    bundleId: null,
    category: "Medicina",
    ratingsCount: null,
    price: "Gratis",
    version: "3.0",
    updatedAt: null,
    shortDescription: null,
    description: "Avisos para tus medicinas.",
    releaseNotes: null,
    screenshots: [],
  } satisfies AppMeta;
  const input: CreativeInput & { count: number; current: { headline: string; subheadline: string }[] } = {
    store: "android",
    countryName: "España",
    lang: "es",
    meta,
    keywords: [{ term: "recordatorio pastillas", position: 3, popularity: 40, opportunity: 60 }],
    facts: null,
    count: 2,
    current: [
      { headline: "", subheadline: "" },
      { headline: "", subheadline: "" },
    ],
  };

  it("bumps the prompt version", () => {
    expect(CREATIVE_PROMPT_VERSION).toBe("crt-3");
  });

  it("accepts only small base64 JPEG, PNG or WebP data URLs", () => {
    expect(parseVisionImage("data:image/jpeg;base64,QUJD")).toEqual({ media_type: "image/jpeg", data: "QUJD" });
    expect(parseVisionImage("data:image/svg+xml;base64,QUJD")).toBeNull();
    expect(parseVisionImage("/api/assets/image?url=x")).toBeNull();
    expect(parseVisionImage(`data:image/png;base64,${"A".repeat(MAX_VISION_IMAGE_CHARS)}`)).toBeNull();
  });

  it("sends the plain prompt without images, and one labelled image per slide with them", () => {
    expect(typeof buildScreenshotCopyContent(input)).toBe("string");
    expect(buildScreenshotCopyContent(input, [null, "not an image"])).toBe(buildScreenshotCopyContent(input));
    const blocks = buildScreenshotCopyContent(input, [null, "data:image/jpeg;base64,QUJD"]);
    expect(Array.isArray(blocks)).toBe(true);
    if (!Array.isArray(blocks)) return;
    expect(blocks.map((b) => b.type)).toEqual(["text", "text", "image"]);
    expect(blocks[1]).toEqual({ type: "text", text: "Screenshot of slide 2:" });
    expect(blocks[0].type === "text" && blocks[0].text).toContain("Relevant tracked keywords");
  });
});
