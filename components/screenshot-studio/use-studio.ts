"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { MAX_SLIDES, staleSlides } from "@/lib/assets/bulk-upload";
import { loadImage, pageFontFamily } from "@/lib/assets/screenshot-render";
import {
  blankSlide,
  type Crop,
  getPreset,
  type ScreenshotSpec,
  type Slide,
  specBytes,
  TEMPLATES,
} from "@/lib/assets/screenshots";
import { detectScreen } from "@/lib/assets/screen-detect";
import { paletteFromImages, themeFromPalette } from "@/lib/assets/palette";
import { applyTemplateWith, type BackgroundMode, gradientPartner, reorder } from "@/lib/assets/studio-edits";
import type { ImageMode, ScreenshotStudioProps, Status } from "./types";

/**
 * The studio's state: the design (spec), the selected screen, the status line, the image cache and the
 * app's colours, plus every edit of the slides. The sections of the screen read and change it from here.
 */
export function useStudio(props: ScreenshotStudioProps) {
  const { initial, storeImages, detectSlides, appIcon, published } = props;
  const [spec, setSpec] = useState<ScreenshotSpec>(initial);
  const [selected, setSelected] = useState(0);
  const [status, setStatus] = useState<Status>(null);
  const [appPalette, setAppPalette] = useState<string[]>([]);
  const [usePalette, setUsePalette] = useState(true);
  const paletteTheme = useMemo(() => themeFromPalette(appPalette), [appPalette]);
  const images = useRef(new Map<string, HTMLImageElement>());
  const font = useMemo(() => pageFontFamily(), []);
  const preset = getPreset(spec.device);
  const slide = spec.slides[Math.min(selected, spec.slides.length - 1)];
  const bytes = specBytes(spec);
  const stale = staleSlides(spec.slides, published);

  const update = (patch: Partial<ScreenshotSpec>) => setSpec((s) => ({ ...s, ...patch }));
  const updateSlide = (id: string, patch: Partial<Slide>) =>
    setSpec((s) => ({
      ...s,
      slides: s.slides.map((sl) => (sl.id === id ? { ...sl, ...patch } : sl)),
    }));
  const updateTheme = (patch: Partial<ScreenshotSpec["theme"]>) => setSpec((s) => ({ ...s, theme: { ...s.theme, ...patch } }));

  const imageFor = useCallback(async (src: string | null) => {
    if (!src) return null;
    const cached = images.current.get(src);
    if (cached) return cached;
    const img = await loadImage(src);
    images.current.set(src, img);
    return img;
  }, []);

  const backgroundFor = useCallback(
    async () => (spec.backgroundImage ? imageFor(spec.backgroundImage).catch(() => null) : null),
    [spec.backgroundImage, imageFor],
  );

  // The app's brand colours, read from its icon (weighted most) and the app screens in the captures.
  const paletteKey = JSON.stringify([appIcon, spec.slides.map((sl) => [sl.image, sl.crop])]);
  useEffect(() => {
    let cancelled = false;
    const sources = JSON.parse(paletteKey) as [string | null, [string | null, Crop | null][]];
    (async () => {
      const [icon, slides] = sources;
      const loaded = await Promise.all([
        icon
          ? imageFor(icon)
              .then((image) => ({ image, crop: null, weight: 4 }))
              .catch(() => null)
          : null,
        ...slides.map(([src, crop]) =>
          src
            ? imageFor(src)
                .then((image) => ({ image, crop, weight: 1 }))
                .catch(() => null)
            : null,
        ),
      ]);
      const usable = loaded.flatMap((x) => (x && x.image ? [{ ...x, image: x.image }] : []));
      if (!cancelled) setAppPalette(paletteFromImages(usable, 4));
    })();
    return () => {
      cancelled = true;
    };
  }, [paletteKey, imageFor]);

  /**
   * Applies a template; with `keepColors` the user's five colours stay (H23). The AI backdrop always
   * stays. A toast offers to undo it.
   */
  function pickTemplate(id: string, keepColors = false) {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    const before = spec;
    setSpec(applyTemplateWith(before, t, { keepColors }));
    toast(`Plantilla «${t.label}» aplicada${keepColors ? " con tus colores" : ""}`, {
      action: { label: "Deshacer", onClick: () => setSpec(before) },
    });
  }

  function addSlide() {
    if (spec.slides.length >= MAX_SLIDES) return;
    const next = blankSlide(slide?.layout ?? "text-top");
    setSpec((s) => ({ ...s, slides: [...s.slides, next] }));
    setSelected(spec.slides.length);
  }
  function removeSlide(id: string) {
    if (spec.slides.length <= 1) return;
    const i = spec.slides.findIndex((sl) => sl.id === id);
    setSpec((s) => ({ ...s, slides: s.slides.filter((sl) => sl.id !== id) }));
    // The selection follows the screen it was on, or the one before the removed one.
    setSelected((sel) => Math.max(0, sel > i || sel === spec.slides.length - 1 ? sel - 1 : sel));
  }
  /** Moves the screen at `from` to position `to` (drag and drop, buttons, Alt+arrows) and selects it. */
  function moveSlideTo(from: number, to: number) {
    const target = Math.max(0, Math.min(spec.slides.length - 1, to));
    if (from === target || from < 0 || from >= spec.slides.length) return;
    setSpec((s) => ({ ...s, slides: reorder(s.slides, from, target) }));
    setSelected(target);
    setStatus({ kind: "ok", text: `Pantalla ${from + 1} movida a la posición ${target + 1}.` });
  }
  function moveSlide(id: string, dir: -1 | 1) {
    const i = spec.slides.findIndex((sl) => sl.id === id);
    if (i >= 0) moveSlideTo(i, i + dir);
  }

  /** Solid colour, a gradient or the AI backdrop (the AI one is applied from its section). */
  function setBackgroundMode(mode: BackgroundMode) {
    if (mode === "solid") setSpec((s) => ({ ...s, backgroundImage: null, theme: { ...s.theme, background2: null } }));
    if (mode === "gradient")
      setSpec((s) => ({
        ...s,
        backgroundImage: null,
        theme: { ...s.theme, background2: s.theme.background2 ?? gradientPartner(s.theme.background) },
      }));
  }

  const modeOf = (sl: Slide): ImageMode => (sl.asIs ? "asis" : sl.crop ? "crop" : "raw");

  /** Finds the app screen inside the image, or falls back to a centred box the user can adjust. */
  async function autoCrop(src: string): Promise<Crop> {
    const img = await imageFor(src).catch(() => null);
    const found = img ? detectScreen(img) : null;
    return found ?? { x: 0.15, y: 0.2, w: 0.7, h: 0.7 };
  }

  async function setImageMode(sl: Slide, mode: ImageMode) {
    if (mode === "crop") {
      const crop = sl.crop ?? (sl.image ? await autoCrop(sl.image) : null);
      updateSlide(sl.id, { asIs: false, crop });
    } else {
      updateSlide(sl.id, {
        asIs: mode === "asis",
        crop: mode === "asis" ? sl.crop : null,
      });
    }
  }

  async function redetect(sl: Slide) {
    if (!sl.image) return;
    const img = await imageFor(sl.image).catch(() => null);
    const found = img ? detectScreen(img) : null;
    if (found) updateSlide(sl.id, { asIs: false, crop: found });
    else
      setStatus({
        kind: "error",
        text: "No se ha encontrado un móvil con marco oscuro en la imagen; marca la pantalla arrastrando sobre la imagen.",
      });
  }

  /** A store screenshot is a finished composition: cut the app screen out of it, or show it as it is. */
  async function pickStoreImage(sl: Slide, src: string) {
    const img = await imageFor(src).catch(() => null);
    const found = img ? detectScreen(img) : null;
    // A store image is the published one: no capture date to compare.
    updateSlide(sl.id, { image: src, asIs: !found, crop: found, capturedAt: null, appVersion: null });
  }

  // Slides the page marked for detection (fresh designs, or saved before the crop existed) get it once.
  const detectOnce = useRef(detectSlides);
  useEffect(() => {
    const ids = detectOnce.current;
    detectOnce.current = [];
    if (ids.length === 0) return;
    let cancelled = false;
    (async () => {
      const found = new Map<string, Crop>();
      for (const sl of initial.slides) {
        if (!ids.includes(sl.id) || !sl.image) continue;
        const img = await imageFor(sl.image).catch(() => null);
        const crop = img ? detectScreen(img) : null;
        if (crop) found.set(sl.id, crop);
      }
      if (cancelled || found.size === 0) return;
      setSpec((s) => ({
        ...s,
        slides: s.slides.map((sl) => (found.has(sl.id) ? { ...sl, asIs: false, crop: found.get(sl.id)! } : sl)),
      }));
    })();
    return () => {
      cancelled = true;
    };
  }, [initial, imageFor]);

  /** Copies this slide's crop to every other slide that shows a store screenshot. */
  function cropAllStoreImages(crop: Crop) {
    setSpec((s) => ({
      ...s,
      slides: s.slides.map((sl) => (sl.image && storeImages.includes(sl.image) ? { ...sl, asIs: false, crop } : sl)),
    }));
  }

  return {
    props,
    spec,
    setSpec,
    selected,
    setSelected,
    status,
    setStatus,
    appPalette,
    usePalette,
    setUsePalette,
    paletteTheme,
    font,
    preset,
    slide,
    bytes,
    stale,
    update,
    updateSlide,
    updateTheme,
    imageFor,
    backgroundFor,
    pickTemplate,
    addSlide,
    removeSlide,
    moveSlide,
    moveSlideTo,
    setBackgroundMode,
    modeOf,
    setImageMode,
    redetect,
    pickStoreImage,
    cropAllStoreImages,
  };
}

export type Studio = ReturnType<typeof useStudio>;
