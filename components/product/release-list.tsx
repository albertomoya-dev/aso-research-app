"use client";

import { History, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addRelease, deleteRelease, updateRelease } from "@/app/product-actions";
import { inputClass } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatDay } from "@/lib/format";
import type { ReleaseRow } from "@/lib/product-queries";

type Editing = { release: ReleaseRow | null } | null;

/** Ajustes › Producto › Versiones: one row per version (number, date, first line of the notes); edited in the side panel. */
export function ReleaseList({ appId, releases }: { appId: number; releases: ReleaseRow[] }) {
  const [editing, setEditing] = useState<Editing>(null);
  const add = (
    <Button onClick={() => setEditing({ release: null })}>
      <Plus size={16} aria-hidden="true" />
      Añadir versión
    </Button>
  );
  return (
    <>
      {releases.length === 0 ? (
        <EmptyState icon={History} title="Aún no hay versiones" description="Apunta qué cambió en cada versión para las notas y los gráficos." action={add} />
      ) : (
        <>
          <ul aria-label="Versiones">
            {releases.map((r) => (
              <li key={r.id} className="border-b border-line">
                <button
                  type="button"
                  onClick={() => setEditing({ release: r })}
                  aria-haspopup="dialog"
                  className="flex min-h-11 w-full items-baseline gap-3 px-5 py-2.5 text-left hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
                >
                  <span className="w-20 shrink-0 font-mono text-table font-medium text-ink">{r.version}</span>
                  <span className="w-24 shrink-0 text-label text-muted">{r.date ? formatDay(r.date) : "Sin fecha"}</span>
                  <span className="min-w-0 flex-1 truncate text-table text-ink-soft">{r.notes.split("\n")[0] || "Sin notas"}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="px-4 py-3">{add}</div>
        </>
      )}
      <Sheet open={editing != null} onOpenChange={(open) => !open && setEditing(null)}>
        <SheetContent>
          {editing && <ReleaseEditor key={editing.release?.id ?? "new"} appId={appId} release={editing.release} onDone={() => setEditing(null)} />}
        </SheetContent>
      </Sheet>
    </>
  );
}

function ReleaseEditor({ appId, release, onDone }: { appId: number; release: ReleaseRow | null; onDone: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();
  const save = (formData: FormData) =>
    start(async () => {
      await (release ? updateRelease(formData) : addRelease(formData));
      toast(release ? `Versión ${formData.get("version")} guardada` : `Versión ${formData.get("version")} añadida`);
      onDone();
    });
  const remove = () =>
    start(async () => {
      const fd = new FormData();
      fd.set("appId", String(appId));
      fd.set("releaseId", String(release!.id));
      await deleteRelease(fd);
      toast(`Versión ${release!.version} quitada del historial`);
      onDone();
    });

  return (
    <form action={save} className="flex flex-1 flex-col gap-4">
      <SheetHeader>
        <SheetTitle>{release ? `Versión ${release.version}` : "Añadir versión"}</SheetTitle>
        <SheetDescription>Lo que cambió para los usuarios. Sirve para las notas de versión.</SheetDescription>
      </SheetHeader>
      <input type="hidden" name="appId" value={appId} />
      {release && <input type="hidden" name="releaseId" value={release.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-table font-medium text-ink-soft">
          Versión
          <input name="version" required maxLength={30} defaultValue={release?.version} placeholder="3.0.0" className={`${inputClass} font-mono`} />
        </label>
        <label className="flex flex-col gap-1.5 text-table font-medium text-ink-soft">
          Fecha
          <input name="date" type="date" defaultValue={release?.date ?? ""} className={inputClass} />
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-table font-medium text-ink-soft">
        Qué cambió
        <textarea name="notes" rows={8} maxLength={4000} defaultValue={release?.notes} placeholder="Qué cambió para los usuarios" className={`${inputClass} py-2`} />
      </label>
      <SheetFooter className="sm:items-center">
        {release &&
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
          {pending ? "Guardando…" : release ? "Guardar" : "Añadir"}
        </Button>
      </SheetFooter>
    </form>
  );
}
