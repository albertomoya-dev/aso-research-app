"use client";

import { useActionState } from "react";
import { type TestState, testIntegration } from "@/app/settings-actions";
import { buttonSecondary } from "./ui";

/** «Probar conexión» / «Enviar email de prueba» for one integration, with the result inline. */
export function IntegrationTest({ id, label, pendingLabel }: { id: string; label: string; pendingLabel: string }) {
  const [state, action, pending] = useActionState<TestState, FormData>(testIntegration, null);
  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} aria-busy={pending} className={buttonSecondary}>
        {pending ? pendingLabel : label}
      </button>
      <p aria-live="polite" className="text-[13px]">
        {state && <span className={state.ok ? "text-up" : "text-danger"}>{state.message}</span>}
      </p>
    </form>
  );
}
