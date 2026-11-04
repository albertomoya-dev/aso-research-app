"use client";

import { buttonPrimary, buttonSecondary, Card, inputClass } from "../ui";
import { RangeField } from "./fields";
import type { Ai } from "./use-ai";
import type { Studio } from "./use-studio";

/** AI backdrops: Claude's prompt ideas, the image provider, the generated ones and the veil over them. */
export function BackgroundCard({ studio, ai }: { studio: Studio; ai: Ai }) {
  const { spec, update, appPalette, usePalette, setUsePalette, props } = studio;
  const { providerLabel, aiEnabled } = props;
  return (
    <Card className="px-5 py-4">
      <h2 className="text-[15px] font-semibold">Fondo con IA</h2>
      {providerLabel ? (
        <>
          <p className="mt-1 text-xs text-muted">
            {providerLabel} dibuja un fondo vertical según la temática de la app; Claude puede proponer el prompt a partir de la ficha y las keywords.
            El fondo se aplica a todas las pantallas, debajo del adorno y del móvil.
          </p>
          {appPalette.length > 0 && (
            <label className="mt-3 flex items-center gap-2 text-xs text-ink-soft">
              <input type="checkbox" checked={usePalette} onChange={(e) => setUsePalette(e.target.checked)} />
              Usar los colores de la app en el fondo con IA
              <span className="flex gap-1" aria-hidden>
                {appPalette.map((c) => (
                  <span key={c} title={c} className="h-4 w-4 rounded-full border border-line-strong" style={{ background: c }} />
                ))}
              </span>
            </label>
          )}
          {aiEnabled && (
            <>
              <input
                value={ai.bgFocus}
                onChange={(e) => ai.setBgFocus(e.target.value)}
                maxLength={200}
                placeholder="Enfoque (opcional): motivos, ambiente, colores…"
                className={`${inputClass} mt-3 w-full`}
              />
              <button
                type="button"
                onClick={ai.proposeBackgrounds}
                disabled={ai.bgWriting}
                aria-busy={ai.bgWriting}
                className={`${buttonSecondary} mt-2 w-full`}
              >
                {ai.bgWriting ? "Proponiendo…" : "Proponer fondos con Claude"}
              </button>
              {ai.bgPrompts.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {ai.bgPrompts.map((p) => (
                    <li key={p.name}>
                      <button
                        type="button"
                        onClick={() => ai.setBgPrompt(p.prompt)}
                        title={p.rationale}
                        aria-pressed={ai.bgPrompt === p.prompt}
                        className={`rounded-md border px-2 py-1 text-xs ${ai.bgPrompt === p.prompt ? "border-brand text-ink" : "border-line-strong text-ink-soft hover:border-muted"}`}
                      >
                        {p.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          <textarea
            value={ai.bgPrompt}
            onChange={(e) => ai.setBgPrompt(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="Prompt en inglés para el modelo de imágenes: colores, motivos, estilo… Sin texto ni móviles."
            className={`${inputClass} mt-3 w-full py-2 text-xs`}
          />
          <button
            type="button"
            onClick={ai.generateBackground}
            disabled={ai.bgGenerating || ai.bgPrompt.trim().length < 10}
            aria-busy={ai.bgGenerating}
            className={`${buttonPrimary} mt-2 w-full`}
          >
            {ai.bgGenerating ? "Generando fondo…" : "Generar fondo"}
          </button>
        </>
      ) : (
        <p className="mt-1 text-xs text-muted">
          Para generar fondos hace falta un proveedor de imágenes: añade <code className="font-mono">OPENAI_API_KEY</code> o{" "}
          <code className="font-mono">GEMINI_API_KEY</code> en Vercel.
        </p>
      )}
      {ai.backgrounds.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {ai.backgrounds.map((b) => {
            const url = `/api/assets/generated/${b.id}`;
            const active = spec.backgroundImage === url;
            return (
              <li key={b.id} className="relative">
                <button
                  type="button"
                  onClick={() => update({ backgroundImage: active ? null : url })}
                  aria-pressed={active}
                  title={b.prompt}
                  className={`block overflow-hidden rounded-md border-2 ${active ? "border-brand" : "border-line hover:border-line-strong"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="h-24 w-auto bg-surface-muted object-cover" loading="lazy" />
                </button>
                <button
                  type="button"
                  onClick={() => ai.removeBackground(b.id)}
                  aria-label="Borrar este fondo"
                  className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border border-line-strong bg-surface text-xs text-muted hover:text-danger"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {spec.backgroundImage && (
        <div className="mt-3 flex flex-col gap-2">
          <RangeField
            label="Velo del color de fondo"
            value={Math.round(spec.backgroundDim * 100)}
            min={0}
            max={90}
            onChange={(v) => update({ backgroundDim: v / 100 })}
            format={(v) => `${v}%`}
          />
          <button type="button" onClick={() => update({ backgroundImage: null })} className={buttonSecondary}>
            Quitar el fondo
          </button>
        </div>
      )}
    </Card>
  );
}
