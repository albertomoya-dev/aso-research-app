"use client";

import { useActionState, useState } from "react";
import { addKeywords, type AddKeywordsState } from "@/app/actions";
import { normalizeKeyword } from "@/lib/keywords";
import { LOW_RELEVANCE, preselect } from "@/lib/relevance";
import { EstimateButton, RelevanceHint, useRelevanceEstimate } from "./relevance-estimate";
import { relevanceNote } from "./relevance-note";
import { buttonPrimary, buttonSecondary } from "./ui";

type Props = {
  appId: number;
  seed?: string;
  suggestions: string[];
  /** Shown as "N frases encontradas en {countryName}" unless a caption is given. */
  countryName: string;
  caption?: string;
  source?: "discover" | "ai";
  /** Store language, for filler words. */
  lang: string;
  /** Shows «Estimar relevancia con IA» when there is an Anthropic key. */
  aiEnabled?: boolean;
};

export function DiscoverList({ appId, seed = "", suggestions, countryName, caption, source = "discover", lang, aiEnabled = false }: Props) {
  const [state, action, pending] = useActionState<AddKeywordsState, FormData>(addKeywords, null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const estimate = useRelevanceEstimate(appId);
  // «Seleccionar todas» leaves out filler words and those rated 2 or less; they can still be ticked one by one.
  const picks = suggestions.filter((t) => preselect(t, estimate.ratingOf(t), lang));
  const allSelected = picks.length > 0 && picks.every((t) => selected.has(t));
  const runEstimate = () =>
    estimate.run(suggestions, (rated) =>
      setSelected((prev) => new Set([...prev].filter((t) => !((rated[normalizeKeyword(t)] ?? Infinity) <= LOW_RELEVANCE)))),
    );
  const toggle = (term: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(term)) next.delete(term);
      else next.add(term);
      return next;
    });

  return (
    <form action={action} onReset={() => setSelected(new Set())}>
      <input type="hidden" name="appId" value={appId} />
      <input type="hidden" name="source" value={source} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <span className="text-[13px] text-muted">
          {caption ?? `${suggestions.length} frases encontradas en ${countryName}`}
        </span>
        <div className="flex flex-wrap gap-2">
          {aiEnabled && <EstimateButton count={suggestions.length} pending={estimate.pending} onClick={runEstimate} />}
          <button type="button" className={buttonSecondary} onClick={() => setSelected(allSelected ? new Set() : new Set(picks))}>
            {allSelected ? "Quitar selección" : "Seleccionar todas"}
          </button>
          <button type="submit" disabled={pending || selected.size === 0} className={buttonPrimary}>
            {pending ? "Añadiendo…" : selected.size === 0 ? "Seguir keywords" : selected.size === 1 ? "Seguir 1 keyword" : `Seguir ${selected.size} keywords`}
          </button>
        </div>
      </div>
      <p aria-live="polite" className="px-5 text-[13px]">
        {estimate.error && <span className="mt-3 block text-danger">{estimate.error}</span>}
        {state?.error && <span className="mt-3 block text-danger">{state.error}</span>}
        {state && !state.error && (
          <span className="mt-3 block text-ink-soft">
            {state.added === 1 ? "1 añadida" : `${state.added} añadidas`} a tus keywords
            {state.trackingFailed && " · su posición se consultará en la próxima actualización"}
            {relevanceNote(state.relevance)}
          </span>
        )}
      </p>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-x-6 px-5 py-3">
        {suggestions.map((term) => (
          <li key={term} className="border-b border-line">
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
              <input
                type="checkbox"
                name="keywords"
                value={term}
                checked={selected.has(term)}
                onChange={() => toggle(term)}
                className="size-5 accent-[var(--brand)]"
              />
              <span>
                {seed && term.startsWith(seed.toLocaleLowerCase()) ? (
                  <>
                    <span className="text-muted">{term.slice(0, seed.length)}</span>
                    <strong className="font-semibold">{term.slice(seed.length)}</strong>
                  </>
                ) : (
                  term
                )}
                <RelevanceHint term={term} rating={estimate.ratingOf(term)} lang={lang} />
              </span>
            </label>
          </li>
        ))}
      </ul>
    </form>
  );
}
