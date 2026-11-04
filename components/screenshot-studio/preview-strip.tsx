"use client";

import { buttonSecondary, Card } from "../ui";
import { PREVIEW_WIDTH } from "./types";
import type { Exporter } from "./use-export";
import type { Previews } from "./use-previews";
import type { Studio } from "./use-studio";

/** Every screen rendered side by side, with the downloads and «+ Añadir pantalla». */
export function PreviewStrip({ studio, previews, exporter }: { studio: Studio; previews: Previews; exporter: Exporter }) {
  const { spec, preset, selected, setSelected, addSlide } = studio;
  const { exporting, exportOne, exportAll } = exporter;
  const previewHeight = Math.round((PREVIEW_WIDTH * preset.height) / preset.width);
  return (
    <Card className="px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">Vista previa</h2>
          <p className="mt-0.5 text-xs text-muted">
            {preset.label} · {preset.width}×{preset.height} px · {spec.slides.length}{" "}
            {spec.slides.length === 1 ? "pantalla" : "pantallas"} · Pulsa una pantalla para editar su texto
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={exportOne} disabled={exporting} className={buttonSecondary}>
            Descargar PNG
          </button>
          <button type="button" onClick={exportAll} disabled={exporting} className={buttonSecondary}>
            {exporting ? "Exportando…" : "Descargar todo (ZIP)"}
          </button>
        </div>
      </div>
      <div className="-mx-5 mt-3 overflow-x-auto px-5 pb-1">
        <ul className="flex min-w-max gap-3">
          {spec.slides.map((sl, i) => (
            <li key={sl.id}>
              <button
                type="button"
                onClick={() => setSelected(i)}
                aria-pressed={i === selected}
                aria-label={`Pantalla ${i + 1}`}
                className={`block overflow-hidden rounded-lg border-2 ${i === selected ? "border-brand" : "border-line hover:border-line-strong"}`}
              >
                <canvas
                  ref={previews.previewRef(sl.id)}
                  style={{
                    height: `min(${previewHeight}px, 30vh)`,
                    aspectRatio: `${preset.width} / ${preset.height}`,
                  }}
                  className="block w-auto bg-surface-muted"
                />
              </button>
              <p className="mt-1.5 text-center font-mono text-xs text-muted">
                {i + 1}
                {sl.keyword ? ` · ${sl.keyword}` : ""}
              </p>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={addSlide}
              disabled={spec.slides.length >= 10}
              className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed border-line-strong px-6 text-[13px] text-muted hover:border-muted hover:text-ink disabled:opacity-50"
              style={{
                height: `min(${previewHeight + 4}px, calc(30vh + 4px))`,
                width: PREVIEW_WIDTH * 0.7,
              }}
            >
              + Añadir pantalla
            </button>
          </li>
        </ul>
      </div>
    </Card>
  );
}
