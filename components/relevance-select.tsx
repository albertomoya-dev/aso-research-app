"use client";

import { useActionState, useOptimistic, useTransition } from "react";
import { recalculateRelevance, type RelevanceState, setKeywordRelevance } from "@/app/ai-actions";
import { NOISE_REASON_LABEL, type NoiseReason, RELEVANCE_SOURCE_LABEL, type RelevanceSource } from "@/lib/relevance";
import { buttonSecondary } from "./ui";

const LEVELS = [
  { value: 5, label: "5 · Exacta" },
  { value: 4, label: "4 · Muy relevante" },
  { value: 3, label: "3 · Relacionada" },
  { value: 2, label: "2 · Poco" },
  { value: 1, label: "1 · Nada" },
];

/** 1–5 selector for one keyword. Saving it makes it «tuya»: the AI will not change it again. */
export function RelevanceSelect({
  appId,
  keywordId,
  term,
  value,
  source,
  reason,
}: {
  appId: number;
  keywordId: number;
  term: string;
  value: number | null;
  source: RelevanceSource | null;
  reason: NoiseReason | null;
}) {
  const [pending, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic({ value, source });
  return (
    <div className="flex flex-col gap-0.5">
      <select
        aria-label={`Relevancia de ${term}`}
        value={shown.value ?? ""}
        disabled={pending}
        onChange={(e) => {
          const next = Number(e.target.value);
          startTransition(async () => {
            setShown({ value: next, source: "user" });
            await setKeywordRelevance(appId, keywordId, next);
          });
        }}
        className="min-h-11 w-[9.5rem] rounded-md border border-line-strong bg-surface px-2 text-[13px] text-ink focus:border-brand focus:outline-2 focus:outline-brand/50 md:min-h-8"
      >
        {shown.value == null && <option value="">Sin valorar</option>}
        {LEVELS.map((l) => (
          <option key={l.value} value={l.value}>
            {l.label}
          </option>
        ))}
      </select>
      <span className="text-xs text-muted">
        {shown.source ? RELEVANCE_SOURCE_LABEL[shown.source] : "Cuenta como 0,7"}
        {reason && reason !== "low" && <span className="text-warn-fg"> · {NOISE_REASON_LABEL[reason]}</span>}
      </span>
    </div>
  );
}

/** «Recalcular relevancia»: one call to Claude per 100 keywords; keeps the ones the user rated. */
export function RecalculateRelevance({ appId, pendingCount }: { appId: number; pendingCount: number }) {
  const [state, action, pending] = useActionState<RelevanceState, FormData>(recalculateRelevance, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2.5">
      <input type="hidden" name="appId" value={appId} />
      <button
        type="submit"
        disabled={pending || pendingCount === 0}
        aria-busy={pending}
        className={buttonSecondary}
        title="Llama a Claude: una petición por cada 100 keywords. No cambia las que has valorado tú."
      >
        {pending ? "Estimando con IA…" : "Recalcular relevancia con IA"}
      </button>
      <span aria-live="polite" className="text-[13px]">
        {state?.error && <span className="text-danger">{state.error}</span>}
        {state && !state.error && (
          <span className="text-ink-soft">
            {state.rated === 1 ? "1 keyword valorada" : `${state.rated} keywords valoradas`}
            {state.asked && state.rated !== undefined && state.rated < state.asked ? ` de ${state.asked}` : ""}
          </span>
        )}
      </span>
    </form>
  );
}
