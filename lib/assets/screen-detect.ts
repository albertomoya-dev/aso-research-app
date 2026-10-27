/**
 * Finds the app screen inside a store screenshot that is already a composition (text, phone mockup…).
 * The phone body is a near-black or dark-grey ring around the screen, so the screen is the box inside
 * the bounding box of the dark pixels, minus the bezel. Backgrounds that are dark themselves defeat it,
 * and then the user crops by hand.
 */
import type { Crop } from "./screenshots";

/** 1 where the pixel is dark and grey (the device body), 0 elsewhere. */
export function darkMask(
  pixels: Uint8ClampedArray,
  w: number,
  h: number,
): Uint8Array {
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = pixels[i * 4];
    const g = pixels[i * 4 + 1];
    const b = pixels[i * 4 + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    mask[i] = lum < 80 && chroma < 48 ? 1 : 0;
  }
  return mask;
}

/** The screen box inside a dark device ring, as fractions of the image, or null when there is no clear ring. */
export function detectScreenInMask(
  mask: Uint8Array,
  w: number,
  h: number,
): Crop | null {
  const rows = new Int32Array(h);
  const cols = new Int32Array(w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) {
        rows[y]++;
        cols[x]++;
      }
    }
  }
  // The device body shows as rows and columns with a run of dark pixels; ignore sparse noise such as text.
  const minRun = Math.max(3, Math.round(Math.min(w, h) * 0.02));
  let top = -1,
    bottom = -1,
    left = -1,
    right = -1;
  for (let y = 0; y < h; y++)
    if (rows[y] >= minRun) {
      if (top < 0) top = y;
      bottom = y;
    }
  for (let x = 0; x < w; x++)
    if (cols[x] >= minRun) {
      if (left < 0) left = x;
      right = x;
    }
  if (top < 0 || left < 0) return null;
  const bw = right - left + 1;
  const bh = bottom - top + 1;
  const area = (bw * bh) / (w * h);
  // A phone takes a good part of the image; the whole image dark means the background is dark too.
  if (area < 0.12 || area > 0.96 || bw < w * 0.2 || bh < h * 0.2) return null;

  // Walk inwards from each edge of the ring until the pixels stop being dark: that is the bezel.
  const dark = (x: number, y: number) => mask[y * w + x] === 1;
  const inwards = (
    from: number,
    step: number,
    limit: number,
    at: (i: number) => boolean,
  ) => {
    let i = from;
    let n = 0;
    while (i !== limit && at(i) && n < Math.max(bw, bh) * 0.25) {
      i += step;
      n++;
    }
    return i;
  };
  // Probe at a quarter of the way along each edge, away from a camera notch in the centre.
  const px = left + Math.round(bw * 0.25);
  const py = top + Math.round(bh * 0.25);
  const screenLeft = inwards(left, 1, right, (x) => dark(x, py));
  const screenRight = inwards(right, -1, left, (x) => dark(x, py));
  const screenTop = inwards(top, 1, bottom, (y) => dark(px, y));
  const screenBottom = inwards(bottom, -1, top, (y) => dark(px, y));
  const sw = screenRight - screenLeft + 1;
  const sh = screenBottom - screenTop + 1;
  if (sw < bw * 0.5 || sh < bh * 0.5) return null;
  // Nudge inside the bezel by a pixel so the rounded corners of the body stay out of the cut.
  const inset = Math.max(1, Math.round(Math.min(sw, sh) * 0.01));
  return {
    x: (screenLeft + inset) / w,
    y: (screenTop + inset) / h,
    w: (sw - inset * 2) / w,
    h: (sh - inset * 2) / h,
  };
}

/** Browser only: downsamples the image and runs the detector. */
export function detectScreen(
  image: HTMLImageElement,
  maxSize = 360,
): Crop | null {
  const scale = Math.min(
    1,
    maxSize / Math.max(image.naturalWidth, image.naturalHeight),
  );
  const w = Math.max(1, Math.round(image.naturalWidth * scale));
  const h = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0, w, h);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return null; // tainted canvas
  }
  return detectScreenInMask(darkMask(data, w, h), w, h);
}
