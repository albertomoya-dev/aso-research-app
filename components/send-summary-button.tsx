"use client";

import { useActionState } from "react";
import { sendSummaryNow, type SendState } from "@/app/alert-actions";
import { buttonSecondary } from "./ui";

export function SendSummaryButton() {
  const [state, action, pending] = useActionState<SendState>(sendSummaryNow, null);
  return (
    <form action={action} className="flex items-center gap-3">
      <span aria-live="polite" className="text-[13px]">
        {state?.ok && <span className="text-up">Enviado</span>}
        {state?.error && <span className="text-danger">{state.error}</span>}
      </span>
      <button type="submit" disabled={pending} className={buttonSecondary}>
        {pending ? "Enviando…" : "Enviármelo ahora"}
      </button>
    </form>
  );
}
