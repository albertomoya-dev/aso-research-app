"use client";

import { useActionState } from "react";
import { addAnnotation, type AnnotationState } from "@/app/actions";
import { buttonSecondary, inputClass } from "./ui";

export function AnnotationForm({ appId, defaultDate }: { appId: number; defaultDate: string }) {
  const [state, action, pending] = useActionState<AnnotationState, FormData>(addAnnotation, null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2.5">
      <input type="hidden" name="appId" value={appId} />
      <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
        Fecha
        <input type="date" name="date" defaultValue={defaultDate} required className={inputClass} />
      </label>
      <label className="flex min-w-0 flex-[1_1_260px] flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
        Qué cambió
        <input type="text" name="label" required maxLength={120} placeholder="Nuevo subtítulo con «contador de pasos»" className={inputClass} />
      </label>
      <button type="submit" disabled={pending} className={buttonSecondary}>
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
