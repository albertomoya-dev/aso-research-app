"use client";

import { useEffect, useRef } from "react";
import { drawSlide, ensureFonts, screenSource } from "@/lib/assets/screenshot-render";
import { applyTemplate, type ScreenshotSpec, TEMPLATES } from "@/lib/assets/screenshots";
import { THUMB_WIDTH } from "./types";
import type { Studio } from "./use-studio";

/** A canvas showing one slide, drawn `width` px wide (CSS then scales it). */
type SlideCanvas = { el: HTMLCanvasElement; slideId: string; width: number };

/**
 * Canvases of the editor, redrawn a moment after the design changes: every screen (the list, the large
 * canvas and the full-set view register theirs) and the template thumbnails of the picker.
 * `layoutKey` changes when canvases appear or swap slides (selection, full-set view, picker open).
 */
export function usePreviews(studio: Studio, layoutKey: string) {
  const { spec, preset, font, imageFor, backgroundFor } = studio;
  const canvases = useRef(new Map<string, SlideCanvas>());
  const thumbs = useRef(new Map<string, HTMLCanvasElement>());

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      await ensureFonts(font, [500, spec.theme.weight]);
      const count = spec.slides.length;
      const background = await backgroundFor();
      for (const [index, sl] of spec.slides.entries()) {
        const targets = [...canvases.current.values()].filter((c) => c.slideId === sl.id);
        if (targets.length === 0) continue;
        const img = await imageFor(sl.image).catch(() => null);
        const nextSlide = spec.slides[(index + 1) % count];
        const pair = spec.pair ? await imageFor(nextSlide?.image ?? null).catch(() => null) : null;
        if (cancelled) return;
        for (const { el, width } of targets) {
          const scale = width / preset.width;
          el.width = Math.round(preset.width * scale);
          el.height = Math.round(preset.height * scale);
          const ctx = el.getContext("2d");
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
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [spec, preset, font, imageFor, backgroundFor, layoutKey]);

  // Thumbnails of the template picker: the first slide rendered with each template.
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
      if (thumbs.current.size === 0) return;
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
        drawSlide(ctx, tspec, tspec.slides[0], img, { fontFamily: font, background }, undefined, undefined, { index: 0, count: 2 }, tspec.pair ? pair : null);
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // Only the inputs that change the thumbnails, not every keystroke on other slides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, font, imageFor, backgroundFor, firstImage, firstAsIs, firstCrop, secondCrop, secondImage, firstHeadline, firstSub, spec.device, layoutKey]);

  return {
    /** Ref callback for a canvas of slide `slideId`; `variant` tells apart the copies of one slide. */
    slideRef: (variant: string, slideId: string, width: number) => (el: HTMLCanvasElement | null) => {
      const key = `${variant}:${slideId}`;
      if (el) canvases.current.set(key, { el, slideId, width });
      else canvases.current.delete(key);
    },
    thumbRef: (templateId: string) => (el: HTMLCanvasElement | null) => {
      if (el) thumbs.current.set(templateId, el);
      else thumbs.current.delete(templateId);
    },
  };
}

export type Previews = ReturnType<typeof usePreviews>;
