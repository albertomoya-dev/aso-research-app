"use client";

import { useActionState } from "react";
import { generateSuggestions, type GenerateState } from "@/app/ai-actions";
import { buttonPrimary, inputClass } from "./ui";

export function GenerateIdeasForm({ appId }: { appId: number }) {
  const [state, action, pending] = useActionState<GenerateState, FormData>(generateSuggestions, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="appId" value={appId} />
      <div className="flex flex-wrap items-end gap-2.5">
        <label className="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
          Enfoque (opcional)
          <input name="focus" maxLength={200} placeholder="por ejemplo: entrenamiento para principiantes" className={inputClass} />
        </label>
        <button type="submit" disabled={pending} aria-busy={pending} className={buttonPrimary}>
          {pending ? "Pensando…" : "Generar ideas"}
        </button>
      </div>
      <p aria-live="polite" className="text-[13px]">
        {state?.error && <span className="text-danger">{state.error}</span>}
        {state && !state.error && (
          <span className="text-ink-soft">
            {state.created === 1 ? "1 idea nueva" : `${state.created} ideas nuevas`}
            {state.dropped ? ` · ${state.dropped} descartadas por repetidas, ya seguidas o con marcas de terceros` : ""}
          </span>
        )}
      </p>
    </form>
  );
}
