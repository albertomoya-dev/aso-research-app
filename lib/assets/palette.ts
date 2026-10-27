/**
 * The brand colours of an app, read from its icon and screenshots: the most frequent clearly
 * coloured pixels, merged so near-identical shades count once. Plain whites, blacks and greys
 * (backgrounds, text) are left out unless nothing else is there.
 */
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
