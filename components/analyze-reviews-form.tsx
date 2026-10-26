"use client";

import { useActionState } from "react";
import { analyzeReviewsAction, type AnalyzeState } from "@/app/review-actions";
import { buttonPrimary } from "./ui";

export function AnalyzeReviewsForm({ appId, target, label }: { appId: number; target: string; label: string }) {
  const [state, action, pending] = useActionState<AnalyzeState, FormData>(analyzeReviewsAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="appId" value={appId} />
      <input type="hidden" name="target" value={target} />
      <button type="submit" disabled={pending} aria-busy={pending} className={buttonPrimary}>
        {pending ? "Leyendo reseñas y analizando…" : label}
      </button>
      <span aria-live="polite" className="text-[13px]">
        {state?.error && <span className="text-danger">{state.error}</span>}
      </span>
    </form>
  );
}
