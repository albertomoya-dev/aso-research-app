"use client";

import { useActionState, useState, useTransition } from "react";
import { acceptSuggestions, type AcceptState, dismissSuggestions } from "@/app/ai-actions";
import { COMPETITION_LABEL, INTENT_LABEL } from "@/lib/suggestions";
import { buttonPrimary, buttonSecondary } from "./ui";

type Idea = { id: number; term: string; intent: string; relevance: number; competition: string; reason: string };

const label = <T extends string>(map: Record<T, string>, key: string) => (key in map ? map[key as T] : key);

function Relevance({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-1" aria-label={`Relevancia ${value} de 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} aria-hidden="true" className={`size-2 rounded-full ${i <= value ? "bg-brand" : "bg-surface-muted"}`} />
      ))}
    </span>
  );
}

export function IdeasList({ appId, ideas, generatedBy }: { appId: number; ideas: Idea[]; generatedBy: string }) {
  const [state, action, pending] = useActionState<AcceptState, FormData>(acceptSuggestions, null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const all = selected.size === ideas.length;
  const [dismissing, startDismiss] = useTransition();
  // A button with its own server action cannot carry a name/value, so the row button calls the action directly.
  const dismissOne = (id: number) =>
    startDismiss(async () => {
      const data = new FormData();
      data.set("appId", String(appId));
      data.set("dismissId", String(id));
      await dismissSuggestions(data);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    });

  return (
    <form action={action} onSubmit={() => setSelected(new Set())}>
      <input type="hidden" name="appId" value={appId} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <h2 className="text-[17px] font-semibold">Ideas pendientes ({ideas.length})</h2>
          <span className="rounded-md bg-warn-bg px-2 py-0.5 text-xs font-semibold text-warn-fg">Estimado por IA</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={buttonSecondary} onClick={() => setSelected(all ? new Set() : new Set(ideas.map((i) => i.id)))}>
            {all ? "Quitar selección" : "Seleccionar todas"}
          </button>
          <button type="submit" formAction={dismissSuggestions} disabled={selected.size === 0} className={buttonSecondary}>
            Descartar
          </button>
          <button type="submit" disabled={pending || selected.size === 0} className={buttonPrimary}>
            {pending ? "Añadiendo…" : selected.size === 0 ? "Seguir keywords" : selected.size === 1 ? "Seguir 1 keyword" : `Seguir ${selected.size} keywords`}
          </button>
        </div>
      </div>
      <p aria-live="polite" className="px-5 text-[13px]">
        {state?.error && <span className="mt-3 block text-danger">{state.error}</span>}
        {state && !state.error && (
          <span className="mt-3 block text-ink-soft">
            {state.added === 1 ? "1 añadida" : `${state.added} añadidas`} a tus keywords
            {state.trackingFailed && " · su posición se consultará en la próxima actualización"}
          </span>
        )}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-semibold tracking-wide text-muted uppercase">
              <th className="w-12 px-5 py-2.5">
                <span className="sr-only">Elegir</span>
              </th>
              <th className="px-3 py-2.5">Keyword</th>
              <th className="px-3 py-2.5">Tipo</th>
              <th className="px-3 py-2.5">Relevancia</th>
              <th className="px-3 py-2.5">Competencia</th>
              <th className="px-3 py-2.5">Por qué</th>
              <th className="px-5 py-2.5">
                <span className="sr-only">Descartar</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {ideas.map((idea) => (
              <tr key={idea.id} className="border-b border-line last:border-0 hover:bg-surface-muted/50">
                <td className="px-5 py-2.5">
                  <input
                    type="checkbox"
                    name="suggestionId"
                    value={idea.id}
                    checked={selected.has(idea.id)}
                    onChange={() => toggle(idea.id)}
                    aria-label={`Elegir ${idea.term}`}
                    className="size-5 accent-[var(--brand)]"
                  />
                </td>
                <td className="px-3 py-2.5 font-medium">{idea.term}</td>
                <td className="px-3 py-2.5 text-ink-soft">{label(INTENT_LABEL, idea.intent)}</td>
                <td className="px-3 py-2.5">
                  <Relevance value={idea.relevance} />
                </td>
                <td className="px-3 py-2.5 text-ink-soft">{label(COMPETITION_LABEL, idea.competition)}</td>
                <td className="max-w-[360px] px-3 py-2.5 text-[13px] text-ink-soft">{idea.reason}</td>
                <td className="px-5 py-2.5 text-right">
                  <button
                    type="button"
                    onClick={() => dismissOne(idea.id)}
                    disabled={dismissing}
                    className="min-h-10 rounded-lg px-2.5 text-[13px] font-medium text-muted hover:bg-surface-muted hover:text-danger"
                  >
                    Descartar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line px-5 py-3 text-xs text-muted">Generado con {generatedBy}</p>
    </form>
  );
}
