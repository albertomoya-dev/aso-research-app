"use client";

import { useActionState, useState } from "react";
import { addKeywords, type AddKeywordsState } from "@/app/actions";
import { buttonPrimary, buttonSecondary } from "./ui";

type Props = {
  appId: number;
  seed?: string;
  suggestions: string[];
  /** Shown as "N frases encontradas en {countryName}" unless a caption is given. */
  countryName: string;
  caption?: string;
  source?: "autocomplete" | "ai";
};

export function DiscoverList({ appId, seed = "", suggestions, countryName, caption, source = "autocomplete" }: Props) {
  const [state, action, pending] = useActionState<AddKeywordsState, FormData>(addKeywords, null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
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
        <div className="flex gap-2">
          <button
            type="button"
            className={buttonSecondary}
            onClick={() => setSelected(selected.size === suggestions.length ? new Set() : new Set(suggestions))}
          >
            {selected.size === suggestions.length ? "Quitar selección" : "Seleccionar todas"}
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
              </span>
            </label>
          </li>
        ))}
      </ul>
    </form>
  );
}
