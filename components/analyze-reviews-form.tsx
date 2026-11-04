"use client";

import { analyzeReviewsAction, type AnalyzeState } from "@/app/review-actions";
import { useLongAction } from "@/lib/long-operations";
import { MAX_REVIEWS } from "@/lib/review-analysis";
import { OperationProgress } from "./operation-progress";
import { buttonPrimary } from "./ui";

/** «Analizar reseñas» of Mercado › Reseñas: reads up to 300 reviews and asks Claude. It keeps running if you leave the page. */
export function AnalyzeReviewsForm({ appId, target, country, label }: { appId: number; target: string; country: string; label: string }) {
  const [state, action, pending, op] = useLongAction<AnalyzeState>(`reviews:${appId}:${target}:${country}`, analyzeReviewsAction, {
    label: "Analizando las reseñas",
    doneLabel: "Análisis de reseñas listo",
    steps: [`Leyendo hasta ${MAX_REVIEWS} reseñas…`, "Analizando temas…", "Escribiendo el informe…"],
  });
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="appId" value={appId} />
        <input type="hidden" name="target" value={target} />
        <input type="hidden" name="country" value={country} />
        <button type="submit" disabled={pending} aria-busy={pending} className={buttonPrimary}>
          {pending ? "Analizando…" : label}
        </button>
        <span aria-live="polite" className="text-[13px]">
          {!pending && state?.error && <span className="text-danger">{state.error}</span>}
        </span>
      </div>
      <OperationProgress op={op} className="max-w-md" />
    </form>
  );
}
