"use client";

import { useActionState } from "react";
import { importSearchTerms, type PlayActionState } from "@/app/play-actions";
import { buttonSecondary, inputClass } from "./ui";

/** Upload form for the search terms CSV exported from Play Console. */
export function SearchTermsImport({ appId }: { appId: number }) {
  const [state, action, pending] = useActionState<PlayActionState, FormData>(importSearchTerms, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="appId" value={appId} />
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
          Archivo CSV
          <input type="file" name="file" accept=".csv,text/csv" required className={`${inputClass} py-1.5`} />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
          Desde
          <input type="date" name="periodStart" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
          Hasta
          <input type="date" name="periodEnd" className={inputClass} />
        </label>
        <button type="submit" disabled={pending} aria-busy={pending} className={buttonSecondary}>
          {pending ? "Importando…" : "Importar CSV"}
        </button>
      </div>
      <p className="text-xs text-muted">
        Las fechas solo hacen falta si el CSV no trae columna de fecha (las descargas desde las pantallas de Play Console): pon el periodo que
        elegiste al descargarlo. Volver a importar el mismo periodo sustituye sus datos.
      </p>
      <p aria-live="polite" className="text-[13px]">
        {state?.error && <span className="text-danger">{state.error}</span>}
        {state?.ok && <span className="text-up">{state.message}</span>}
      </p>
    </form>
  );
}
