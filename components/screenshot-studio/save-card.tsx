"use client";

import { MAX_SPEC_BYTES } from "@/lib/assets/screenshots";
import { buttonPrimary, Card } from "../ui";
import type { Exporter } from "./use-export";
import type { Studio } from "./use-studio";

/** The status line: the last action's result, or when the design was saved. */
export function StatusLine({ studio, className }: { studio: Studio; className?: string }) {
  const { status, props } = studio;
  return (
    <p aria-live="polite" className={className}>
      {status ? (
        <span className={status.kind === "error" ? "text-danger" : "text-ink-soft"}>{status.text}</span>
      ) : props.savedAt ? (
        <span className="text-muted">Guardado por última vez el {props.savedAt}.</span>
      ) : (
        <span className="text-muted">Aún no guardado.</span>
      )}
    </p>
  );
}

export function SaveCard({ studio, exporter }: { studio: Studio; exporter: Exporter }) {
  const { bytes } = studio;
  return (
    <Card className="px-5 py-4">
      <button type="button" onClick={exporter.save} disabled={exporter.saving || bytes > MAX_SPEC_BYTES} className={`${buttonPrimary} w-full`}>
        {exporter.saving ? "Guardando…" : "Guardar diseño"}
      </button>
      <StatusLine studio={studio} className="mt-2 text-xs" />
      {bytes > MAX_SPEC_BYTES && (
        <p className="mt-1 text-xs text-warn-fg">El conjunto pesa {(bytes / 1_000_000).toFixed(1)} MB; el máximo es 3,5 MB. Quita alguna captura.</p>
      )}
    </Card>
  );
}
