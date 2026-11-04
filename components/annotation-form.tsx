"use client";

import { useActionState } from "react";
import { addAnnotation, type AnnotationState } from "@/app/actions";
import { cn } from "@/lib/cn";
import { buttonPrimary, buttonSecondary, inputClass } from "./ui";

/**
 * Date and label of a manual annotation. `onDone` runs after it is saved (the dialog of «Cambios y
 * pruebas» closes); `stacked` lays the fields one under the other, with the button as the primary one.
 */
export function AnnotationForm({ appId, defaultDate, onDone, stacked = false }: { appId: number; defaultDate: string; onDone?: () => void; stacked?: boolean }) {
  const [state, action, pending] = useActionState<AnnotationState, FormData>(async (prev, formData) => {
    const result = await addAnnotation(prev, formData);
    if (result?.ok) onDone?.();
    return result;
  }, null);
  return (
    <form action={action} className={cn("flex gap-2.5", stacked ? "flex-col" : "flex-wrap items-end")}>
      <input type="hidden" name="appId" value={appId} />
      <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
        Fecha
        <input type="date" name="date" defaultValue={defaultDate} required className={inputClass} />
      </label>
      <label className="flex min-w-0 flex-[1_1_260px] flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
        Qué cambió
        <input type="text" name="label" required maxLength={120} placeholder="Campaña de Navidad en redes" className={inputClass} />
      </label>
      <button type="submit" disabled={pending} className={cn(stacked ? `${buttonPrimary} self-end` : buttonSecondary)}>
        {pending ? "Guardando…" : "Añadir anotación"}
      </button>
      {state?.error && (
        <p role="alert" className="basis-full text-[13px] text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
