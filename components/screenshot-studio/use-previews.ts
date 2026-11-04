"use client";

import { useEffect, useRef } from "react";
import { drawSlide, ensureFonts, screenSource } from "@/lib/assets/screenshot-render";
import { applyTemplate, type ScreenshotSpec, TEMPLATES } from "@/lib/assets/screenshots";
import { PREVIEW_WIDTH, THUMB_WIDTH } from "./types";
import type { Studio } from "./use-studio";

/**
 * Canvas refs of the screen previews (by slide id) and of the template thumbnails (by template id),
 * redrawn a moment after the design changes.
 */
export function usePreviews(studio: Studio) {
  const { spec, preset, font, imageFor, backgroundFor } = studio;
  const canvases = useRef(new Map<string, HTMLCanvasElement>());
  const thumbs = useRef(new Map<string, HTMLCanvasElement>());

  // Redraw every preview a moment after the spec changes.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      await ensureFonts(font, [500, spec.theme.weight]);
      const count = spec.slides.length;
      const background = await backgroundFor();
      for (const [index, sl] of spec.slides.entries()) {
        const canvas = canvases.current.get(sl.id);
        if (!canvas) continue;
        const img = await imageFor(sl.image).catch(() => null);
        const nextSlide = spec.slides[(index + 1) % count];
        const pair = spec.pair ? await imageFor(nextSlide?.image ?? null).catch(() => null) : null;
        if (cancelled) return;
        const scale = PREVIEW_WIDTH / preset.width;
        canvas.width = Math.round(preset.width * scale);
        canvas.height = Math.round(preset.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        drawSlide(
          ctx,
          spec,
          sl,
          screenSource(img, sl.crop),
          { fontFamily: font, background },
          undefined,
          undefined,
          { index, count },
          screenSource(pair, nextSlide?.crop),
        );
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [spec, preset, font, imageFor, backgroundFor]);

  // Thumbnails of the gallery: the first slide rendered with each template.
  const first = spec.slides[0];
  const firstImage = first?.image ?? null;
  const firstAsIs = first?.asIs ?? false;
  const firstCrop = first?.crop ?? null;
  const secondImage = spec.slides[1]?.image ?? null;
  const secondCrop = spec.slides[1]?.crop ?? null;
  const firstHeadline = first?.headline ?? "";
  const firstSub = first?.subheadline ?? "";
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      await ensureFonts(font, [500, 600, 700, 800]);
      const img = firstAsIs ? null : screenSource(await imageFor(firstImage).catch(() => null), firstCrop);
      const pair = firstAsIs
        ? null
        : screenSource(await imageFor(secondImage ?? firstImage).catch(() => null), secondImage ? secondCrop : firstCrop);
      const background = await backgroundFor();
      if (cancelled) return;
      for (const t of TEMPLATES) {
        const canvas = thumbs.current.get(t.id);
        if (!canvas) continue;
        const base: ScreenshotSpec = {
          ...spec,
          slides: [
            {
              id: "thumb",
              headline: firstHeadline || "Tu *titular* aquí",
              subheadline: firstSub,
              // A finished store composition would show a device inside the device: use an empty screen instead.
              image: firstAsIs ? null : firstImage,
              layout: "text-top",
              keyword: null,
              asIs: false,
              crop: firstAsIs ? null : firstCrop,
              capturedAt: null,
              appVersion: null,
            },
          ],
        };
        const tspec = applyTemplate(base, t);
        const scale = THUMB_WIDTH / preset.width;
        canvas.width = Math.round(preset.width * scale);
        canvas.height = Math.round(preset.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        drawSlide(
          ctx,
          tspec,
          tspec.slides[0],
          img,
          { fontFamily: font, background },
          undefined,
          undefined,
          { index: 0, count: 2 },
          tspec.pair ? pair : null,
        );
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // Only the inputs that change the thumbnails, not every keystroke on other slides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, font, imageFor, backgroundFor, firstImage, firstAsIs, firstCrop, secondCrop, secondImage, firstHeadline, firstSub, spec.device]);

  /** Ref callback that registers a canvas under `key` in `map`. */
  const register = (map: { current: Map<string, HTMLCanvasElement> }, key: string) => (el: HTMLCanvasElement | null) => {
    if (el) map.current.set(key, el);
    else map.current.delete(key);
  };

  return {
    previewRef: (slideId: string) => register(canvases, slideId),
    thumbRef: (templateId: string) => register(thumbs, templateId),
  };
}

export type Previews = ReturnType<typeof usePreviews>;
