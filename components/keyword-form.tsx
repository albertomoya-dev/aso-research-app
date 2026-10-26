"use client";

import { useActionState, useState } from "react";
import { addKeywords, type AddKeywordsState } from "@/app/actions";
import { parseKeywords } from "@/lib/keywords";
import { buttonPrimary } from "./ui";

export function KeywordForm({ appId }: { appId: number }) {
  const [state, action, pending] = useActionState<AddKeywordsState, FormData>(addKeywords, null);
  // React resets the form after a successful action; onReset keeps the counter in sync.
  const [total, setTotal] = useState(0);

  return (
    <form action={action} onReset={() => setTotal(0)} className="flex flex-wrap items-end gap-4">
      <input type="hidden" name="appId" value={appId} />
      <label className="flex min-w-0 flex-[1_1_420px] flex-col gap-1.5 text-sm font-semibold">
        Carga manual
        <span className="text-[13px] font-normal text-muted">Una por línea o separadas por comas</span>
        <textarea
          name="keywords"
          rows={3}
          onChange={(e) => setTotal(parseKeywords(e.target.value).length)}
          placeholder="app para correr, rutas para correr, entrenamiento 5k"
          className="resize-y rounded-[10px] border border-line-strong bg-surface px-3 py-2.5 text-sm font-normal text-ink focus:border-brand focus:outline-3 focus:outline-brand-soft"
        />
      </label>
      <button type="submit" disabled={pending || total === 0} className={buttonPrimary}>
        {pending ? "Añadiendo…" : total === 1 ? "Añadir 1 keyword" : `Añadir ${total} keywords`}
      </button>
      <p aria-live="polite" className="basis-full text-[13px]">
        {state?.error && <span className="text-danger">{state.error}</span>}
        {state && !state.error && (
          <span className="text-ink-soft">
            {state.added === 1 ? "1 añadida" : `${state.added} añadidas`}
            {state.skipped > 0 && ` · ${state.skipped} ya estaban`}
          </span>
        )}
      </p>
    </form>
  );
}
