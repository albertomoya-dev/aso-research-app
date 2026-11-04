"use client";

import { ListChecks, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addFeature, deleteFeature, updateFeature } from "@/app/product-actions";
import { inputClass } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { FEATURE_STATUS_LABEL, FEATURE_STATUSES, type FeatureStatus } from "@/lib/product-facts";
import type { FeatureRow } from "@/lib/product-queries";

/** Chip colours per status: only what is published (or about to be) stands out. */
const STATUS_CHIP: Record<FeatureStatus, string> = {
  shipped: "bg-brand-soft text-brand-strong",
  next_release: "bg-warn-bg text-warn-fg",
  planned: "bg-surface-muted text-ink-soft",
  retired: "bg-surface-muted text-muted line-through",
};

const STATUS_HINT: Record<FeatureStatus, string> = {
  shipped: "Ya está en la versión de la tienda: la IA puede anunciarla.",
  next_release: "Llega en la próxima versión: la IA la anuncia solo si preparas la ficha para ella.",
  planned: "En el plan: la IA nunca la anuncia.",
  retired: "Se quitó: la IA nunca la anuncia.",
};

export function StatusChip({ status }: { status: FeatureStatus }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-label font-medium whitespace-nowrap", STATUS_CHIP[status])}>{FEATURE_STATUS_LABEL[status]}</span>;
}

type Editing = { feature: FeatureRow | null } | null;

/**
 * Ajustes › Producto › Funciones (D7): one card per feature with its status chip; a click opens the
 * side panel to edit it. «Añadir función» opens the same panel empty. The server actions are those of
 * the old rows (app/product-actions.ts), with the same validation.
 */
export function FeatureList({ appId, features }: { appId: number; features: FeatureRow[] }) {
  const [editing, setEditing] = useState<Editing>(null);
  const add = (
    <Button onClick={() => setEditing({ feature: null })}>
      <Plus size={16} aria-hidden="true" />
      Añadir función
    </Button>
  );
  return (
    <>
      {features.length === 0 ? (
        <EmptyState icon={ListChecks} title="Aún no hay funciones" description="Añádelas una a una o impórtalas desde tu CHANGELOG." action={add} />
      ) : (
        <>
          <ul aria-label="Funciones" className="grid gap-2 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {features.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => setEditing({ feature: f })}
                  aria-haspopup="dialog"
                  className="flex h-full w-full flex-col items-start gap-1.5 rounded-card border border-line bg-surface px-3.5 py-3 text-left hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-brand"
                >
                  <span className="flex w-full flex-wrap items-center gap-1.5">
                    <StatusChip status={f.status} />
                    {f.sinceVersion && <span className="font-mono text-label text-muted">v{f.sinceVersion}</span>}
                    {!f.advertise && <span className="rounded-full bg-surface-muted px-2 py-0.5 text-label text-ink-soft">No se anuncia</span>}
                  </span>
                  <span className={cn("text-table font-medium", f.status === "retired" ? "text-muted line-through" : "text-ink")}>{f.name}</span>
                  {f.summary && <span className="line-clamp-2 text-label text-ink-soft">{f.summary}</span>}
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-line px-4 py-3">{add}</div>
        </>
      )}
      <Sheet open={editing != null} onOpenChange={(open) => !open && setEditing(null)}>
        <SheetContent>
          {editing && <FeatureEditor key={editing.feature?.id ?? "new"} appId={appId} feature={editing.feature} onDone={() => setEditing(null)} />}
        </SheetContent>
      </Sheet>
    </>
  );
}

function FeatureEditor({ appId, feature, onDone }: { appId: number; feature: FeatureRow | null; onDone: () => void }) {
  const [status, setStatus] = useState<FeatureStatus>(feature?.status ?? "shipped");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();
  const save = (formData: FormData) =>
    start(async () => {
      await (feature ? updateFeature(formData) : addFeature(formData));
      toast(feature ? "Función guardada" : "Función añadida");
      onDone();
    });
  const remove = () =>
    start(async () => {
      const fd = new FormData();
      fd.set("appId", String(appId));
      fd.set("featureId", String(feature!.id));
      await deleteFeature(fd);
      toast(`«${feature!.name}» quitada de la ficha de producto`);
      onDone();
    });

  return (
    <form action={save} className="flex flex-1 flex-col gap-4">
      <SheetHeader>
        <SheetTitle>{feature ? "Editar función" : "Añadir función"}</SheetTitle>
        <SheetDescription>{STATUS_HINT[status]}</SheetDescription>
      </SheetHeader>
      <input type="hidden" name="appId" value={appId} />
      {feature && <input type="hidden" name="featureId" value={feature.id} />}
      <label className="flex flex-col gap-1.5 text-table font-medium text-ink-soft">
        Nombre
        <input name="name" required maxLength={120} defaultValue={feature?.name} placeholder="p. ej. «Escanear el código de barras»" className={inputClass} />
      </label>
      <label className="flex flex-col gap-1.5 text-table font-medium text-ink-soft">
        Qué permite hacer
        <textarea name="summary" rows={3} maxLength={300} defaultValue={feature?.summary} placeholder="En una frase" className={`${inputClass} py-2`} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-table font-medium text-ink-soft">
          Estado
          <select name="status" value={status} onChange={(e) => setStatus(e.target.value as FeatureStatus)} className={inputClass}>
            {FEATURE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {FEATURE_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-table font-medium text-ink-soft">
          Desde la versión
          <input name="sinceVersion" maxLength={30} defaultValue={feature?.sinceVersion ?? ""} placeholder="p. ej. 3.0.0" className={`${inputClass} font-mono`} />
        </label>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-table text-ink md:min-h-9">
        <input type="checkbox" name="advertise" defaultChecked={feature?.advertise ?? true} className="size-5 accent-[var(--brand)]" />
        Anunciar en la ficha
        <span className="text-label text-muted">(desmárcalo en las funciones internas)</span>
      </label>
      <SheetFooter className="sm:items-center">
        {feature &&
          (confirmDelete ? (
            <span className="flex items-center gap-2 sm:mr-auto">
              <span className="text-table text-ink-soft">¿Quitarla?</span>
              <Button variant="danger" size="sm" disabled={pending} onClick={remove}>
                Sí, quitar
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                No
              </Button>
            </span>
          ) : (
            <Button variant="ghost" className="text-danger sm:mr-auto" onClick={() => setConfirmDelete(true)}>
              Quitar
            </Button>
          ))}
        <Button type="submit" variant="primary" disabled={pending} aria-busy={pending}>
          {pending ? "Guardando…" : feature ? "Guardar" : "Añadir"}
        </Button>
      </SheetFooter>
    </form>
  );
}
