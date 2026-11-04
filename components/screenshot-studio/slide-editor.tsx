"use client";

import { HEADLINE_SOFT_LIMIT, type Slide, stripMarks, SUBHEADLINE_SOFT_LIMIT } from "@/lib/assets/screenshots";
import { buttonSecondary, Card, inputClass } from "../ui";
import { CaptureFields } from "./capture-fields";
import type { Upload } from "./use-upload";
import type { Studio } from "./use-studio";

/** The selected screen: its order, its texts, its keyword and its screenshot. */
export function SlideEditor({ studio, upload, slide }: { studio: Studio; upload: Upload; slide: Slide }) {
  const { spec, selected, setSelected, moveSlide, removeSlide, updateSlide, setImageMode, props } = studio;
  const { keywordOptions } = props;
  const headLen = stripMarks(slide.headline).length;
  return (
    <Card className="px-5 py-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-[15px] font-semibold">Pantalla {selected + 1}</h2>
          {spec.slides.length > 1 && (
            <div role="group" aria-label="Elegir pantalla" className="flex flex-wrap gap-1">
              {spec.slides.map((sl, i) => (
                <button
                  key={sl.id}
                  type="button"
                  onClick={() => setSelected(i)}
                  aria-pressed={i === selected}
                  title={sl.headline ? stripMarks(sl.headline) : "Sin texto"}
                  className={`h-7 min-w-7 rounded-md border px-2 text-xs ${i === selected ? "border-brand bg-brand text-white" : "border-line-strong text-ink-soft hover:border-muted"}`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => moveSlide(slide.id, -1)} disabled={selected === 0} className={buttonSecondary} aria-label="Mover a la izquierda">
            ←
          </button>
          <button
            type="button"
            onClick={() => moveSlide(slide.id, 1)}
            disabled={selected === spec.slides.length - 1}
            className={buttonSecondary}
            aria-label="Mover a la derecha"
          >
            →
          </button>
          <button type="button" onClick={() => removeSlide(slide.id)} disabled={spec.slides.length <= 1} className={buttonSecondary}>
            Quitar
          </button>
        </div>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {slide.asIs && (
          <p className="rounded-md bg-warn-bg px-3 py-2 text-xs text-warn-fg md:col-span-2">
            Esta pantalla usa la captura «tal cual», así que el texto no se dibuja.{" "}
            <button type="button" onClick={() => setImageMode(slide, "crop")} className="font-medium underline">
              Recortar la pantalla y usar la plantilla
            </button>{" "}
            para que se vea.
          </p>
        )}
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft md:col-span-2">
          <span className="flex justify-between">
            Titular
            <span className={`font-mono text-xs ${headLen > HEADLINE_SOFT_LIMIT ? "text-warn-fg" : "text-muted"}`}>
              {headLen}/{HEADLINE_SOFT_LIMIT}
            </span>
          </span>
          <textarea
            value={slide.headline}
            onChange={(e) => updateSlide(slide.id, { headline: e.target.value })}
            rows={2}
            className={`${inputClass} py-2 font-normal`}
            placeholder="Corre *sin excusas*"
          />
          <span className="text-xs font-normal text-muted">Pon *asteriscos* alrededor de la palabra que quieras resaltar con el color de acento.</span>
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft md:col-span-2">
          <span className="flex justify-between">
            Subtítulo
            <span className={`font-mono text-xs ${slide.subheadline.length > SUBHEADLINE_SOFT_LIMIT ? "text-warn-fg" : "text-muted"}`}>
              {slide.subheadline.length}/{SUBHEADLINE_SOFT_LIMIT}
            </span>
          </span>
          <input
            value={slide.subheadline}
            onChange={(e) => updateSlide(slide.id, { subheadline: e.target.value })}
            className={`${inputClass} font-normal`}
            placeholder="Planes de entrenamiento con GPS y métricas en tiempo real"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
          Texto
          <select
            value={slide.layout}
            onChange={(e) => updateSlide(slide.id, { layout: e.target.value as Slide["layout"] })}
            className={inputClass}
          >
            <option value="text-top">Arriba, móvil abajo</option>
            <option value="text-bottom">Abajo, móvil arriba</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
          Keyword de esta pantalla
          <input
            value={slide.keyword ?? ""}
            onChange={(e) => updateSlide(slide.id, { keyword: e.target.value || null })}
            list="slide-keyword-options"
            className={`${inputClass} font-normal`}
            placeholder={keywordOptions.length ? "Elige entre tus keywords relevantes" : "Solo como recordatorio"}
          />
          <datalist id="slide-keyword-options">
            {keywordOptions.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
        </label>
        <CaptureFields studio={studio} upload={upload} slide={slide} />
      </div>
    </Card>
  );
}
