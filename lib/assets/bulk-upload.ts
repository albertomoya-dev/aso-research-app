import type { Slide } from "./screenshots";

// Bulk upload of screenshots (F9): several files or a whole folder dropped at once, placed in order
// on consecutive slides, and the warning for screenshots older than the published version. Pure helpers.

export const MAX_SLIDES = 10;

const collator = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

/** Natural order by file name: «captura 2» before «captura 10». Ties fall back to the full path. */
export function sortByName<T extends { name: string; path?: string }>(files: T[]): T[] {
  return [...files].sort((a, b) => collator.compare(a.name, b.name) || collator.compare(a.path ?? "", b.path ?? ""));
}

export const isImageFile = (f: { name: string; type: string }) =>
  f.type ? f.type.startsWith("image/") : /\.(png|jpe?g|webp|gif|avif|heic)$/i.test(f.name);

export type UploadedImage = { image: string; capturedAt: string | null; appVersion: string | null };

/**
 * Puts the images on consecutive slides from `start`, replacing their image (and resetting the crop and the
 * "as is" flag, since these are raw captures), and adds new slides after the last one while there is room.
 * Images that do not fit in MAX_SLIDES are dropped and counted.
 */
export function assignImages(
  slides: Slide[],
  start: number,
  images: UploadedImage[],
  makeSlide: () => Slide,
): { slides: Slide[]; placed: { from: number; to: number } | null; dropped: number } {
  const out = [...slides];
  const from = Math.max(0, Math.min(start, out.length));
  let index = from;
  let placed = 0;
  for (const img of images) {
    if (index >= MAX_SLIDES) break;
    const base = out[index] ?? makeSlide();
    out[index] = { ...base, image: img.image, capturedAt: img.capturedAt, appVersion: img.appVersion, asIs: false, crop: null };
    index++;
    placed++;
  }
  return { slides: out, placed: placed ? { from, to: from + placed - 1 } : null, dropped: images.length - placed };
}

/** The published listing the screenshots are compared with. */
export type PublishedRef = { version: string | null; updatedAt: string | null };

/**
 * Slides whose uploaded screenshot is older than the last update of the published listing (by capture
 * date) or was uploaded while an older version was published. Store images and slides without a date
 * cannot be judged and are not listed.
 */
export function staleSlides(slides: Slide[], published: PublishedRef): number[] {
  const updated = published.updatedAt ? Date.parse(published.updatedAt) : NaN;
  const out: number[] = [];
  slides.forEach((s, i) => {
    if (!s.image) return;
    const captured = s.capturedAt ? Date.parse(s.capturedAt) : NaN;
    const olderDate = Number.isFinite(updated) && Number.isFinite(captured) && captured < updated;
    const olderVersion = Boolean(s.appVersion && published.version && s.appVersion !== published.version);
    if (olderDate || olderVersion) out.push(i);
  });
  return out;
}
