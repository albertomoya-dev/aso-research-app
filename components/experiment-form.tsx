"use client";

import { useActionState } from "react";
import { deleteExperiment, type ExperimentState, saveExperiment } from "@/app/experiment-actions";
import type { Experiment } from "@/db/schema";
import { EXPERIMENT_STATUS_LABEL, EXPERIMENT_STATUSES } from "@/lib/experiments";
import { ConfirmButton } from "./confirm-button";
import { buttonPrimary, buttonSecondary, inputClass } from "./ui";

const label = "flex min-w-0 flex-col gap-1.5 text-[13px] font-medium text-ink-soft";

/** Plan, result and lesson of one store listing experiment. Without `experiment`, the form creates a new one. */
export function ExperimentForm({ appId, experiment }: { appId: number; experiment?: Experiment }) {
  const [state, action, pending] = useActionState<ExperimentState, FormData>(saveExperiment, null);
  const e = experiment;
  return (
    <form action={action} className="grid gap-3 md:grid-cols-2">
      <input type="hidden" name="appId" value={appId} />
      {e && <input type="hidden" name="experimentId" value={e.id} />}
      <label className={`${label} md:col-span-2`}>
        Nombre
        <input name="name" required maxLength={120} defaultValue={e?.name} placeholder="Icono con fondo verde" className={inputClass} />
      </label>
      <label className={label}>
        Hipótesis
        <textarea name="hypothesis" rows={2} maxLength={1000} defaultValue={e?.hypothesis} placeholder="Si el icono destaca más en la lista de resultados, más visitantes instalarán" className={`${inputClass} py-2`} />
      </label>
      <label className={label}>
        Variante
        <textarea name="variant" rows={2} maxLength={2000} defaultValue={e?.variant} placeholder="Qué cambia frente a la ficha actual" className={`${inputClass} py-2`} />
      </label>
      <label className={label}>
        Métrica
        <input name="metric" maxLength={200} defaultValue={e?.metric} placeholder="Instalaciones de primera vez (retenidas un día)" className={inputClass} />
      </label>
      <div className="grid grid-cols-3 gap-3">
        <label className={label}>
          Inicio
          <input type="date" name="startDate" defaultValue={e?.startDate ?? ""} className={inputClass} />
        </label>
        <label className={label}>
          Fin
          <input type="date" name="endDate" defaultValue={e?.endDate ?? ""} className={inputClass} />
        </label>
        <label className={label}>
          Estado
          <select name="status" defaultValue={e?.status ?? "planned"} className={inputClass}>
            {EXPERIMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {EXPERIMENT_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {e && (
        <>
          <label className={label}>
            Resultado de Play Console
            <textarea name="result" rows={2} maxLength={2000} defaultValue={e.result} placeholder="La variante ganó: +4,2 % (intervalo de +1,1 % a +7,3 %)" className={`${inputClass} py-2`} />
          </label>
          <label className={label}>
            Lo aprendido
            <textarea name="learned" rows={2} maxLength={2000} defaultValue={e.learned} placeholder="Qué harías igual o distinto la próxima vez" className={`${inputClass} py-2`} />
          </label>
        </>
      )}
      <div className="flex flex-wrap items-center gap-2 md:col-span-2">
        <button type="submit" disabled={pending} className={e ? buttonSecondary : buttonPrimary}>
          {pending ? "Guardando…" : e ? "Guardar" : "Añadir experimento"}
        </button>
        {e && (
          <ConfirmButton formAction={deleteExperiment} formNoValidate message={`¿Borrar el experimento «${e.name}»?`} className={`${buttonSecondary} text-danger`}>
            Borrar
          </ConfirmButton>
        )}
        {state?.error && (
          <p role="alert" className="text-[13px] text-danger">
            {state.error}
          </p>
        )}
        {state?.ok && !state.error && e && <p className="text-[13px] text-muted">Guardado.</p>}
      </div>
    </form>
  );
}
