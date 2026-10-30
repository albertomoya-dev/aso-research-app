"use client";

import { useActionState } from "react";
import { type FactsState, saveFacts } from "@/app/product-actions";
import type { ProductFacts } from "@/lib/product-facts";
import { buttonPrimary, inputClass } from "./ui";

const label = "flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft";
const hint = "text-xs font-normal text-muted";

export function ProductFactsForm({ appId, facts }: { appId: number; facts: ProductFacts }) {
  const [state, action, pending] = useActionState<FactsState, FormData>(saveFacts, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="appId" value={appId} />
      <label className={label}>
        Qué es, en una frase
        <input name="pitch" defaultValue={facts.pitch} maxLength={300} placeholder="p. ej. «Pastillero digital para no olvidar ninguna toma»" className={inputClass} />
      </label>
      <label className={label}>
        Para quién es
        <input name="audience" defaultValue={facts.audience} maxLength={300} placeholder="p. ej. «Personas que toman medicación a diario y quienes las cuidan»" className={inputClass} />
      </label>
      <div className="grid gap-4 md:grid-cols-2">
        <label className={label}>
          Qué te diferencia de la competencia
          <span className={hint}>Una idea por línea.</span>
          <textarea name="differentiators" rows={4} defaultValue={facts.differentiators.join("\n")} maxLength={3000} className={`${inputClass} py-2`} />
        </label>
        <label className={label}>
          Lo que la ficha nunca debe decir
          <span className={hint}>Una norma por línea, p. ej. «No hacer afirmaciones médicas».</span>
          <textarea name="constraints" rows={4} defaultValue={facts.constraints.join("\n")} maxLength={3000} className={`${inputClass} py-2`} />
        </label>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className={label}>
          Tono de la marca
          <input name="tone" defaultValue={facts.tone} maxLength={200} placeholder="p. ej. «cercano y tranquilo, sin alarmismo»" className={inputClass} />
        </label>
        <label className={label}>
          Idiomas de la app
          <input name="languages" defaultValue={facts.languages.join(", ")} maxLength={500} placeholder="separados por comas: español, inglés" className={inputClass} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <button type="submit" disabled={pending} className={buttonPrimary}>
          {pending ? "Guardando…" : "Guardar ficha"}
        </button>
        <span aria-live="polite" className="text-[13px] text-muted">
          {state?.error && <span className="text-danger">{state.error}</span>}
          {state?.savedAt && "Ficha guardada"}
        </span>
      </div>
    </form>
  );
}
