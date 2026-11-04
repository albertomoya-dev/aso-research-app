"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { Experiment } from "@/db/schema";
import { EXPERIMENT_STATUS_LABEL, EXPERIMENT_STATUSES } from "@/lib/experiments";
import { formatDate } from "@/lib/format";
import { experimentColumns } from "@/lib/timeline";
import { ExperimentForm } from "../experiment-form";
import { Button } from "../ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../ui/sheet";

/**
 * Store listing experiments as a board: Planeado, En marcha and Terminado. A card opens its plan,
 * result and lesson in a side panel; «Nuevo experimento» opens an empty one.
 */
export function ExperimentBoard({ appId, experiments }: { appId: number; experiments: Experiment[] }) {
  // "new", an experiment id, or nothing. A deleted experiment closes its panel on its own.
  const [editing, setEditing] = useState<"new" | number | null>(null);
  const current = typeof editing === "number" ? experiments.find((e) => e.id === editing) : undefined;
  const open = editing === "new" || current != null;
  const columns = experimentColumns(experiments);

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => setEditing("new")}>
          <Plus size={16} aria-hidden="true" />
          Nuevo experimento
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {EXPERIMENT_STATUSES.map((status) => (
          <section key={status} aria-labelledby={`exp-col-${status}`} data-status={status} className="flex min-w-0 flex-col gap-2 rounded-card bg-surface-muted p-3">
            <h3 id={`exp-col-${status}`} className="flex items-center justify-between text-[13px] font-semibold text-ink">
              {EXPERIMENT_STATUS_LABEL[status]}
              <span className="font-mono text-label font-normal text-muted">{columns[status].length}</span>
            </h3>
            {columns[status].length === 0 ? (
              <p className="px-1 py-3 text-[13px] text-muted">Ninguno</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {columns[status].map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => setEditing(e.id)}
                      className="flex w-full flex-col items-start gap-1 rounded-card border border-line bg-surface p-3 text-left hover:border-line-strong focus-visible:outline-2 focus-visible:outline-brand"
                    >
                      <span className="font-medium wrap-break-word text-ink">{e.name}</span>
                      {(e.startDate || e.endDate) && (
                        <span className="text-label text-muted">
                          {formatDate(e.startDate)} – {formatDate(e.endDate)}
                        </span>
                      )}
                      {e.metric && <span className="text-label text-ink-soft">{e.metric}</span>}
                      {e.learned && <span className="line-clamp-2 text-[13px] text-ink-soft">{e.learned}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
      <Sheet open={open} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{current ? current.name : "Nuevo experimento"}</SheetTitle>
            <SheetDescription>
              {current ? EXPERIMENT_STATUS_LABEL[current.status] : "Una sola cosa por prueba, al menos 7 días."}
            </SheetDescription>
          </SheetHeader>
          {open && (
            <ExperimentForm
              key={current?.id ?? "new"}
              appId={appId}
              experiment={current}
              onDone={() => {
                setEditing(null);
                toast(current ? "Experimento guardado" : "Experimento añadido");
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
