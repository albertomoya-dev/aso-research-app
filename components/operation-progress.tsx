"use client";

import { Check, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { type Operation, useOperationStep } from "@/lib/long-operations";

/**
 * The steps of a long AI operation while it runs («Leyendo 300 reseñas… Analizando temas…»), with a
 * line saying the user can leave: the result waits for them and a toast says when it is ready.
 */
export function OperationProgress({ op, className }: { op: Operation | undefined; className?: string }) {
  const { index } = useOperationStep(op);
  if (!op || op.status !== "running") return null;
  return (
    <div role="status" aria-live="polite" className={cn("flex flex-col gap-1.5 rounded-control bg-surface-muted px-3 py-2.5 text-table", className)}>
      <ol className="flex flex-col gap-1">
        {op.steps.map((step, i) => (
          <li
            key={step}
            aria-current={i === index ? "step" : undefined}
            className={cn("flex items-center gap-2", i < index ? "text-ink-soft" : i === index ? "font-medium text-ink" : "text-muted")}
          >
            {i < index ? (
              <Check size={14} aria-hidden="true" className="shrink-0 text-up" />
            ) : i === index ? (
              <LoaderCircle size={14} aria-hidden="true" className="shrink-0 animate-spin text-brand motion-reduce:animate-none" />
            ) : (
              <span aria-hidden="true" className="inline-block size-3.5 shrink-0" />
            )}
            {step}
          </li>
        ))}
      </ol>
      <p className="text-label text-muted">Puedes seguir navegando: te avisamos al terminar.</p>
    </div>
  );
}
