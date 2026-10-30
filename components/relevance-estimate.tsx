"use client";

import { useState, useTransition } from "react";
import { estimateRelevance } from "@/app/ai-actions";
import { normalizeKeyword } from "@/lib/keywords";
import { LOW_RELEVANCE } from "@/lib/relevance";
import { isNoiseTerm } from "@/lib/stopwords";
import { buttonSecondary } from "./ui";

/** Most candidates estimated per click: two requests to Claude. */
const MAX_ESTIMATE = 200;

/** On-demand relevance of candidate keywords. Nothing is stored; `onRated` gets the new ratings. */
export function useRelevanceEstimate(appId: number) {
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ratingOf = (term: string): number | undefined => ratings[normalizeKeyword(term)];
  const run = (terms: string[], onRated?: (rated: Record<string, number>) => void) => {
    const todo = terms.filter((t) => ratingOf(t) === undefined).slice(0, MAX_ESTIMATE);
    if (todo.length === 0) return;
    startTransition(async () => {
      const result = await estimateRelevance(appId, todo);
      setRatings((prev) => ({ ...prev, ...result.ratings }));
      setError(result.error ?? null);
      onRated?.(result.ratings);
    });
  };
  return { ratingOf, run, pending, error };
}

export function EstimateButton({ count, pending, onClick }: { count: number; pending: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending || count === 0}
      aria-busy={pending}
      className={buttonSecondary}
      title={`Llama a Claude con tu ficha de producto (una petición por cada 100). Estima hasta ${MAX_ESTIMATE} cada vez y no guarda nada.`}
    >
      {pending ? "Estimando…" : "Estimar relevancia con IA"}
    </button>
  );
}

/** «Relevancia 4», «Palabra vacía» or nothing, next to a candidate keyword. */
export function RelevanceHint({ term, rating, lang }: { term: string; rating: number | undefined; lang: string }) {
  if (isNoiseTerm(term, lang)) return <span className="ml-2 text-xs text-muted">palabra vacía</span>;
  if (rating === undefined) return null;
  return (
    <span className={`ml-2 text-xs ${rating <= LOW_RELEVANCE ? "text-warn-fg" : "text-muted"}`} title="Estimación de la IA, de 1 a 5">
      relevancia {rating}
    </span>
  );
}
