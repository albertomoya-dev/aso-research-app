/**
 * The brand colours of an app, read from its icon and screenshots: the most frequent clearly
 * coloured pixels, merged so near-identical shades count once. Plain whites, blacks and greys
 * (backgrounds, text) are left out unless nothing else is there.
 */
import { contrastRatio, luminance } from "./icon";
import type { Crop } from "./screenshots";

const hex = (r: number, g: number, b: number) =>
  "#" +
  [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

type Bin = { n: number; r: number; g: number; b: number };

/** Up to `max` colours as #rrggbb, most representative first. `weights` repeats a source's pixels. */
export function paletteFromPixels(
  sources: { pixels: Uint8ClampedArray; weight?: number }[],
  max = 5,
): string[] {
  const bins = new Map<number, Bin>();
  for (const { pixels, weight = 1 } of sources) {
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] < 128) continue;
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const bin = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
      bin.n += weight;
      bin.r += r * weight;
      bin.g += g * weight;
      bin.b += b * weight;
      bins.set(key, bin);
    }
  }
  const colours = [...bins.values()].map((bin) => {
    const r = bin.r / bin.n;
    const g = bin.g / bin.n;
    const b = bin.b / bin.n;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    return { r, g, b, n: bin.n, chroma };
  });
  const total = colours.reduce((s, c) => s + c.n, 0) || 1;
  // Colour carries the brand; frequency alone would always pick the white of the app's background.
  const coloured = colours
    .filter((c) => c.chroma >= 40 && c.n / total >= 0.002)
    .sort(
      (a, b) => b.n * (0.5 + b.chroma / 255) - a.n * (0.5 + a.chroma / 255),
    );
  const pool =
    coloured.length > 0 ? coloured : colours.sort((a, b) => b.n - a.n);
  const picked: typeof pool = [];
  for (const c of pool) {
    if (picked.length >= max) break;
    if (picked.some((p) => Math.hypot(p.r - c.r, p.g - c.g, p.b - c.b) < 70))
      continue;
    picked.push(c);
  }
  return picked.map((c) => hex(c.r, c.g, c.b));
}

/** Browser only: samples each image (or its crop) at a small size and reads the palette. */
export function paletteFromImages(
  sources: { image: HTMLImageElement; crop?: Crop | null; weight?: number }[],
  max = 5,
  size = 96,
): string[] {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  const samples: { pixels: Uint8ClampedArray; weight?: number }[] = [];
  for (const { image, crop, weight } of sources) {
    const c = crop ?? { x: 0, y: 0, w: 1, h: 1 };
    const sw = image.naturalWidth * c.w;
    const sh = image.naturalHeight * c.h;
    if (sw <= 0 || sh <= 0) continue;
    const scale = size / Math.max(sw, sh);
    canvas.width = Math.max(1, Math.round(sw * scale));
    canvas.height = Math.max(1, Math.round(sh * scale));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
      image,
      image.naturalWidth * c.x,
      image.naturalHeight * c.y,
      sw,
      sh,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    try {
      samples.push({
        pixels: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
        weight,
      });
    } catch {
      // A tainted canvas (cross-origin image) has no readable pixels; skip it.
    }
  }
  return paletteFromPixels(samples, max);
}

// ---------- Theme from the app's colours ----------

type Rgb = [number, number, number];
type Hsl = [number, number, number];

const toRgb = (color: string): Rgb => {
  const n = parseInt(color.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

function toHsl(color: string): Hsl {
  const [r, g, b] = toRgb(color).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function fromHsl([h, s, l]: Hsl): string {
  const hue = (p: number, q: number, t: number) => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  if (s === 0) return hex(l * 255, l * 255, l * 255);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return hex(hue(p, q, h + 1 / 3) * 255, hue(p, q, h) * 255, hue(p, q, h - 1 / 3) * 255);
}

/**
 * `color` with its lightness moved (towards white or black, whichever can get there) until it
 * reaches `min` contrast against every colour of `against`. Unchanged when it already does.
 */
export function ensureContrast(color: string, against: string[], min: number): string {
  const worst = (c: string) => Math.min(...against.map((a) => contrastRatio(c, a)));
  if (worst(color) >= min) return color;
  const [h, s, l] = toHsl(color);
  const bgLight = Math.max(...against.map(luminance)) > 0.18;
  // Move away from the backgrounds first; if that end cannot reach `min`, try the other one.
  for (const dir of bgLight ? [-1, 1] : [1, -1]) {
    for (let step = 1; step <= 100; step++) {
      const next = fromHsl([h, s, Math.min(1, Math.max(0, l + (dir * step) / 100))]);
      if (worst(next) >= min) return next;
    }
  }
  return worst("#ffffff") >= worst("#000000") ? "#ffffff" : "#000000";
}

/** WCAG AA for normal text; the headline is large, but the subtitle is not, so both use it. */
export const AA_TEXT = 4.5;
/** WCAG AA for large text: the *highlighted* words of the headline. */
export const AA_LARGE = 3;

/** The accent must stand out from the headline it marks: this contrast against the text… */
const ACCENT_VS_TEXT = 1.5;
/** …or this distance in RGB (a different hue at a similar lightness). */
const ACCENT_RGB_DISTANCE = 80;

const rgbDistance = (a: string, b: string) => {
  const [x, y] = [toRgb(a), toRgb(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};
const distinctFrom = (accent: string, text: string) => contrastRatio(accent, text) >= ACCENT_VS_TEXT || rgbDistance(accent, text) >= ACCENT_RGB_DISTANCE;

/**
 * An accent made from the brand colour when the palette has no second one: its hue turned (~35°, then
 * further) with enough saturation, on the text's side of the lightness, kept at 3:1 against both
 * gradient stops and distinct from the text. The text itself only when nothing else works.
 */
function derivedAccent(brand: string, backgrounds: string[], text: string, darkText: boolean): string {
  const [h, s] = toHsl(brand);
  const saturation = Math.max(s, 0.6);
  const lightness = darkText ? [0.3, 0.22, 0.38, 0.15] : [0.72, 0.8, 0.65, 0.88];
  for (const turn of [35, -35, 60, -60, 180]) {
    for (const l of lightness) {
      const candidate = ensureContrast(fromHsl([(h + turn / 360 + 1) % 1, saturation, l]), backgrounds, AA_LARGE);
      if (distinctFrom(candidate, text)) return candidate;
    }
  }
  return text;
}

export type PaletteTheme = { background: string; background2: string; text: string; subtext: string; accent: string; frame: "dark" | "light" };

/**
 * Screenshot colours from the app's palette (most representative first): the brand colour as the
 * background with a subtle gradient, a headline tinted with it that keeps AA contrast (4.5:1)
 * against both ends of the gradient, a softer subtitle that also keeps it, and the second brand
 * colour as the accent (at least 3:1, it only marks words of the large headline; derived from the brand
 * colour when there is no usable second one, always distinct from the text). Null without colours.
 */
export function themeFromPalette(palette: string[]): PaletteTheme | null {
  const valid = palette.filter((c) => /^#[0-9a-f]{6}$/i.test(c));
  if (valid.length === 0) return null;
  const brand = valid[0];
  const [h, s, l] = toHsl(brand);
  // White text on dark and mid tones, dark text on light ones (the side with more contrast).
  const darkText = contrastRatio(brand, "#000000") > contrastRatio(brand, "#ffffff");
  // The gradient moves away from the text, so its second stop only adds contrast.
  const background2 = fromHsl([h, s, Math.min(1, Math.max(0, l + (darkText ? 0.08 : -0.1)))]);
  const backgrounds = [brand, background2];
  const text = ensureContrast(fromHsl([h, Math.min(s, 0.6), darkText ? 0.1 : 0.98]), backgrounds, AA_TEXT);
  const subtext = ensureContrast(fromHsl([h, Math.min(s, 0.35), darkText ? 0.3 : 0.86]), backgrounds, AA_TEXT);
  // The second brand colour, if one stands out from the background and, once readable, from the text;
  // else one derived from the brand colour (never the text colour: the highlighted words would vanish).
  const second = valid
    .filter((c, i) => i > 0 && contrastRatio(c, brand) >= 1.5)
    .map((c) => ensureContrast(c, backgrounds, AA_LARGE))
    .find((c) => distinctFrom(c, text));
  const accent = second ?? derivedAccent(brand, backgrounds, text, darkText);
  return { background: brand, background2, text, subtext, accent, frame: darkText ? "dark" : "light" };
}
