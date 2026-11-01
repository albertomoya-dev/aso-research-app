"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useOptimistic, useState, useTransition } from "react";
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
  status,
}: {
  appId: number;
  keywordId: number;
  term: string;
  value: number | null;
  source: RelevanceSource | null;
  reason: NoiseReason | null;
  /** Why it has no relevance yet (see RELEVANCE_PROGRESS_LABEL); only for unrated keywords. */
  status?: string;
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
        {shown.source ? RELEVANCE_SOURCE_LABEL[shown.source] : status ? `${status} · cuenta como 0,7` : "Cuenta como 0,7"}
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

/** Refreshes while the AI rates keywords just added: every 15 s, 10 times (2,5 min). The job lasts at most 120 s. */
export const PENDING_REFRESH_INTERVAL_MS = 15_000;
export const PENDING_REFRESH_MAX = 10;

/**
 * Reloads the page every few seconds while the AI is still rating keywords just added, and says so.
 * Gives up after PENDING_REFRESH_MAX reloads (the request is over by then) and asks to reload later.
 */
export function RefreshWhilePending({
  intervalMs = PENDING_REFRESH_INTERVAL_MS,
  maxRefreshes = PENDING_REFRESH_MAX,
}: {
  intervalMs?: number;
  maxRefreshes?: number;
}) {
  const router = useRouter();
  const [refreshes, setRefreshes] = useState(0);
  const done = refreshes >= maxRefreshes;
  useEffect(() => {
    if (done) return;
    const id = setTimeout(() => {
      setRefreshes((n) => n + 1);
      router.refresh();
    }, intervalMs);
    return () => clearTimeout(id);
  }, [router, intervalMs, refreshes, done]);
  return <> {done ? "Sigue en segundo plano: recarga más tarde." : "La tabla se actualiza sola."}</>;
}
