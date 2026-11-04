"use client";

import { Sparkles } from "lucide-react";
import { HEADLINE_SOFT_LIMIT, type Slide, stripMarks, SUBHEADLINE_SOFT_LIMIT } from "@/lib/assets/screenshots";
import { inputClass } from "../ui";
import { Button } from "../ui/button";
import { HelpTip } from "../ui/help-tip";
import { fieldLabel } from "./fields";
import type { Ai } from "./use-ai";
import type { Studio } from "./use-studio";

/** Texto: headline, subtitle, where the text goes and the keyword of the selected screen, plus Claude's copy. */
export function TextFields({ studio, ai, slide }: { studio: Studio; ai: Ai; slide: Slide }) {
  const { updateSlide, setImageMode, props } = studio;
  const { keywordOptions, aiEnabled } = props;
  const headLen = stripMarks(slide.headline).length;
  return (
    <div className="flex flex-col gap-3">
      {slide.asIs && (
        <p className="rounded-control bg-warn-bg px-3 py-2 text-xs text-warn-fg">
          Captura «tal cual»: el texto no se dibuja.{" "}
          <button type="button" onClick={() => setImageMode(slide, "crop")} className="font-medium underline">
            Usar la plantilla
          </button>
        </p>
      )}
      <label className={fieldLabel}>
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
          aria-describedby="headline-help"
          className={`${inputClass} py-2 font-normal`}
          placeholder="Corre *sin excusas*"
        />
        <span id="headline-help" className="text-xs font-normal text-muted">
          Entre *asteriscos*, la palabra que va en el color de acento.
        </span>
      </label>
      <label className={fieldLabel}>
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
          placeholder="Planes con GPS y métricas en tiempo real"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={fieldLabel}>
          Texto
          <select
            value={slide.layout}
            onChange={(e) => updateSlide(slide.id, { layout: e.target.value as Slide["layout"] })}
            className={`${inputClass} w-full min-w-0`}
          >
            <option value="text-top">Arriba</option>
            <option value="text-bottom">Abajo</option>
          </select>
        </label>
        <label className={fieldLabel}>
          Keyword
          <input
            value={slide.keyword ?? ""}
            onChange={(e) => updateSlide(slide.id, { keyword: e.target.value || null })}
            list="slide-keyword-options"
            className={`${inputClass} w-full min-w-0 font-normal`}
            placeholder={keywordOptions.length ? "Tus keywords" : "Recordatorio"}
          />
          <datalist id="slide-keyword-options">
            {keywordOptions.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
        </label>
      </div>
      {aiEnabled && <AiCopyFields ai={ai} />}
    </div>
  );
}

/** Claude writes a headline, a subtitle and a keyword for every screen (it replaces the current texts). */
function AiCopyFields({ ai }: { ai: Ai }) {
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <h4 className="flex items-center gap-1 text-[13px] font-medium text-ink-soft">
        Textos con IA
        <HelpTip label="Textos con IA">
          Claude redacta un titular y un subtítulo por pantalla con la ficha de producto y tus keywords relevantes con más oportunidad, y elige la
          keyword de cada pantalla. Sustituye los textos actuales.
        </HelpTip>
      </h4>
      <label className="flex items-start gap-2 text-[13px] text-ink-soft">
        <input type="checkbox" checked={ai.sendScreens} onChange={(e) => ai.setSendScreens(e.target.checked)} className="mt-0.5" />
        <span>Enviar las capturas para que Claude vea cada pantalla (cuesta algo más)</span>
      </label>
      <input
        value={ai.focus}
        onChange={(e) => ai.setFocus(e.target.value)}
        maxLength={200}
        aria-label="Enfoque de los textos"
        placeholder="Enfoque (opcional): tono, público, oferta…"
        className={`${inputClass} w-full`}
      />
      <Button onClick={ai.writeCopy} disabled={ai.writing} aria-busy={ai.writing} className="w-full">
        <Sparkles size={16} aria-hidden="true" />
        {ai.writing ? "Redactando…" : "Redactar textos de todas las pantallas"}
      </Button>
      {ai.notes.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs text-ink-soft">
          {ai.notes.map((n) => (
            <li key={n}>· {n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
