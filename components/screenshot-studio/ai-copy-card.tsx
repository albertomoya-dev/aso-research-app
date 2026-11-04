"use client";

import { buttonPrimary, Card, inputClass } from "../ui";
import type { Ai } from "./use-ai";

/** Claude writes a headline, a subtitle and a keyword for every screen. */
export function AiCopyCard({ ai }: { ai: Ai }) {
  return (
    <Card className="px-5 py-4">
      <h2 className="text-[15px] font-semibold">Textos con IA</h2>
      <p className="mt-1 text-xs text-muted">
        Claude redacta un titular y un subtítulo por pantalla a partir de la ficha de producto y de tus keywords relevantes con más oportunidad, y
        elige para cada pantalla la keyword que mejor la describe. Sustituye los textos actuales.
      </p>
      <label className="mt-3 flex items-start gap-2 text-[13px] text-ink-soft">
        <input type="checkbox" checked={ai.sendScreens} onChange={(e) => ai.setSendScreens(e.target.checked)} className="mt-0.5" />
        <span>Enviar las capturas para que Claude vea cada pantalla (una imagen pequeña por pantalla; la petición cuesta algo más).</span>
      </label>
      <input
        value={ai.focus}
        onChange={(e) => ai.setFocus(e.target.value)}
        maxLength={200}
        placeholder="Enfoque (opcional): tono, público, oferta…"
        className={`${inputClass} mt-3 w-full`}
      />
      <button type="button" onClick={ai.writeCopy} disabled={ai.writing} aria-busy={ai.writing} className={`${buttonPrimary} mt-2 w-full`}>
        {ai.writing ? "Redactando…" : "Redactar textos"}
      </button>
      {ai.notes.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 text-xs text-ink-soft">
          {ai.notes.map((n) => (
            <li key={n}>· {n}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}
