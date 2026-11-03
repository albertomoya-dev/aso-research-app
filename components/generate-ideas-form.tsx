"use client";

import { useActionState } from "react";
import { generateSuggestions, type GenerateState } from "@/app/ai-actions";
import { buttonPrimary } from "./ui";

/**
 * «Generar ideas» of Encontrar › Ideas con IA. The focus is the seed or topic of the page (the shared
 * field above the tabs), sent as a hidden value.
 */
export function GenerateIdeasForm({ appId, focus = "" }: { appId: number; focus?: string }) {
  const [state, action, pending] = useActionState<GenerateState, FormData>(generateSuggestions, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="appId" value={appId} />
      <input type="hidden" name="focus" value={focus} />
      <button type="submit" disabled={pending} aria-busy={pending} className={buttonPrimary}>
        {pending ? "Pensando…" : focus ? `Generar ideas sobre «${focus}»` : "Generar ideas"}
      </button>
      <p aria-live="polite" className="text-[13px]">
        {pending && <span className="text-ink-soft">Tarda entre 20 segundos y un minuto.</span>}
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
