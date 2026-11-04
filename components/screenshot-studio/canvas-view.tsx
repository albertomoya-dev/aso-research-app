"use client";

import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "../ui/button";
import { PREVIEW_WIDTH } from "./types";
import type { Previews } from "./use-previews";
import type { Studio } from "./use-studio";

/** Resolution of the large canvas: sharp up to twice the fitted size. */
const MAIN_WIDTH = 720;
export const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

/**
 * The selected screen, large, with zoom (1 = fitted to the window height); or, in the full-set view,
 * every screen side by side as the store shows them. Zoomed in, it scrolls inside its own box.
 */
export function CanvasView({
  studio,
  previews,
  zoom,
  setZoom,
  overview,
  setOverview,
}: {
  studio: Studio;
  previews: Previews;
  zoom: number;
  setZoom: (z: number) => void;
  overview: boolean;
  setOverview: (v: boolean) => void;
}) {
  const { spec, preset, slide, selected, setSelected } = studio;
  const ratio = `${preset.width} / ${preset.height}`;

  if (overview) {
    return (
      <section aria-label="Vista del set completo" className="min-w-0 rounded-card border border-line bg-surface p-4">
        <ol className="relative flex gap-3 overflow-x-auto pb-2">
          {spec.slides.map((sl, i) => (
            <li key={sl.id} className="shrink-0">
              <button
                type="button"
                onClick={() => {
                  setSelected(i);
                  setOverview(false);
                }}
                aria-label={`Editar la pantalla ${i + 1}`}
                className={cn(
                  "block overflow-hidden rounded-control border-2",
                  i === selected ? "border-brand" : "border-line hover:border-line-strong",
                )}
              >
                <canvas
                  ref={previews.slideRef("set", sl.id, PREVIEW_WIDTH)}
                  style={{ aspectRatio: ratio }}
                  className="block h-[min(420px,55dvh)] w-auto bg-surface-muted"
                />
              </button>
              <p className="mt-1.5 text-center font-mono text-label text-muted">
                {i + 1}
                {sl.keyword ? ` · ${sl.keyword}` : ""}
              </p>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  const index = ZOOMS.findIndex((z) => z === zoom);
  return (
    <section aria-label="Lienzo" className="flex min-w-0 flex-col gap-2 rounded-card border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-[13px] text-ink-soft">
          <span className="font-medium text-ink">Pantalla {selected + 1}</span> de {spec.slides.length}
          {slide?.keyword ? <span className="text-muted"> · {slide.keyword}</span> : null}
        </p>
        <div role="group" aria-label="Zoom" className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setZoom(ZOOMS[Math.max(0, index - 1)])} disabled={index <= 0} aria-label="Alejar">
            <ZoomOut size={16} aria-hidden="true" />
          </Button>
          <output aria-live="polite" className="w-12 text-center font-mono text-label text-ink-soft">
            {Math.round(zoom * 100)} %
          </output>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, index + 1)])}
            disabled={index >= ZOOMS.length - 1}
            aria-label="Acercar"
          >
            <ZoomIn size={16} aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setZoom(1)} disabled={zoom === 1}>
            <Maximize2 size={16} aria-hidden="true" />
            Ajustar
          </Button>
        </div>
      </div>
      <div className="relative flex max-h-[calc(100dvh-300px)] min-h-80 overflow-auto rounded-control bg-bg p-4">
        {slide && (
          <canvas
            ref={previews.slideRef("main", slide.id, MAIN_WIDTH)}
            role="img"
            aria-label={`Vista previa de la pantalla ${selected + 1}`}
            style={{ aspectRatio: ratio, height: `calc(max(300px, 100dvh - 380px) * ${zoom})` }}
            className="m-auto block w-auto max-w-none shrink-0 rounded-control border border-line bg-surface-muted"
          />
        )}
      </div>
    </section>
  );
}
