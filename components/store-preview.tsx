"use client";

import { useEffect, useMemo, useRef } from "react";
import { drawSlide, ensureFonts, loadImage, pageFontFamily, screenSource } from "@/lib/assets/screenshot-render";
import { getPreset, type ScreenshotSpec } from "@/lib/assets/screenshots";
import { formatRating } from "@/lib/format";
import type { Store } from "@/lib/stores/types";
import { AppIcon } from "./app-icon";
import { PREVIEW_SHOTS } from "@/lib/metadata-check";

type Props = {
  store: Store;
  icon: string;
  developer: string;
  rating: number | null;
  /** From the editor, so the preview follows what is typed. */
  title: string;
  /** Google Play short description, or App Store subtitle. */
  tagline: string;
  /** Published screenshots (`meta.screenshots`), used when there is no design in Creativos. */
  screenshots: string[];
  /** The Creativos design, already cut to its first PREVIEW_SHOTS slides: drawn like the studio does. */
  design: ScreenshotSpec | null;
};

/**
 * The listing as a phone shows it in the store: Google Play (icon, title, developer, install, the first
 * screenshots and the short description under «Información de la app») or the App Store (name and
 * subtitle next to the icon, «Obtener», screenshots). A sketch of the layout, not a pixel copy.
 */
export function StorePreview({ store, icon, developer, rating, title, tagline, screenshots, design }: Props) {
  const ios = store === "ios";
  const shots = design && design.slides.length > 0 ? null : screenshots.slice(0, PREVIEW_SHOTS);
  return (
    <figure aria-label={`Vista previa en ${ios ? "App Store" : "Google Play"}`} className="mx-auto w-full max-w-[360px]">
      <div className="overflow-hidden rounded-[28px] border border-line-strong bg-surface p-4">
        <div className="flex items-start gap-3">
          <AppIcon src={icon} size={ios ? 72 : 64} alt="Icono de la app" />
          <div className="min-w-0 flex-1">
            <p data-preview="title" className="text-[18px] leading-6 font-semibold break-words text-ink">
              {title || <span className="text-muted">Sin título</span>}
            </p>
            {ios && (
              <p data-preview="tagline" className="mt-0.5 text-table break-words text-ink-soft">
                {tagline || <span className="text-muted">Sin subtítulo</span>}
              </p>
            )}
            <p className="mt-0.5 truncate text-table font-medium text-link">{developer}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3 text-label text-ink-soft">
          {rating != null && <span>{formatRating(rating)}</span>}
          <span aria-hidden="true" className={`ml-auto inline-flex min-h-8 items-center rounded-full px-5 text-table font-medium ${ios ? "bg-surface-muted text-link" : "bg-brand text-on-brand"}`}>
            {ios ? "Obtener" : "Instalar"}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {shots
            ? shots.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={src} src={src} alt={`Captura ${i + 1}`} loading="lazy" className="aspect-[9/16] w-full rounded-control border border-line bg-surface-muted object-cover" />
              ))
            : design && <DesignShots spec={design} />}
          {shots && shots.length === 0 && <p className="col-span-3 rounded-control bg-surface-muted px-3 py-6 text-center text-label text-muted">Sin capturas</p>}
        </div>
        {!ios && (
          <div className="mt-4">
            <p className="text-table font-semibold text-ink">Información de la app</p>
            <p data-preview="tagline" className="mt-1 text-table break-words text-ink-soft">
              {tagline || <span className="text-muted">Sin descripción corta</span>}
            </p>
          </div>
        )}
      </div>
      <figcaption className="mt-2 text-center text-label text-muted">
        {design ? "Capturas de tu diseño en Creativos." : "Capturas publicadas."} El texto es el del editor.
      </figcaption>
    </figure>
  );
}

const THUMB_WIDTH = 220;

/** The first slides of the Creativos design, drawn on canvases with the studio's renderer. */
function DesignShots({ spec }: { spec: ScreenshotSpec }) {
  const canvases = useRef<(HTMLCanvasElement | null)[]>([]);
  const preset = useMemo(() => getPreset(spec.device), [spec.device]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const font = pageFontFamily();
      await ensureFonts(font, [500, spec.theme.weight]);
      const load = (src: string | null) => (src ? loadImage(src).catch(() => null) : Promise.resolve(null));
      const background = await load(spec.backgroundImage);
      const count = spec.slides.length;
      for (const [index, slide] of spec.slides.entries()) {
        const canvas = canvases.current[index];
        const img = await load(slide.image);
        const next = spec.slides[(index + 1) % count];
        const pair = spec.pair ? await load(next?.image ?? null) : null;
        if (cancelled || !canvas) return;
        const scale = THUMB_WIDTH / preset.width;
        canvas.width = Math.round(preset.width * scale);
        canvas.height = Math.round(preset.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        drawSlide(ctx, spec, slide, screenSource(img, slide.crop), { fontFamily: font, background }, undefined, undefined, { index, count }, screenSource(pair, next?.crop));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [spec, preset]);
  return spec.slides.map((slide, i) => (
    <canvas
      key={slide.id}
      ref={(el) => {
        canvases.current[i] = el;
      }}
      role="img"
      aria-label={`Captura ${i + 1}${slide.headline ? `: ${slide.headline}` : ""}`}
      className="w-full rounded-control border border-line bg-surface-muted"
      style={{ aspectRatio: `${preset.width} / ${preset.height}` }}
    />
  ));
}
