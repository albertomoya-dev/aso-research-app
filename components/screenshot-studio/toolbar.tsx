"use client";

import { Download, GalleryHorizontal, MoreHorizontal } from "lucide-react";
import { MAX_SPEC_BYTES, presetsFor } from "@/lib/assets/screenshots";
import { inputClass } from "../ui";
import { Button } from "../ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
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

/** Top bar: device and size, the full-set view, «Guardar» (the one primary action), the ZIP and «⋯». */
export function Toolbar({
  studio,
  exporter,
  overview,
  setOverview,
}: {
  studio: Studio;
  exporter: Exporter;
  overview: boolean;
  setOverview: (v: boolean) => void;
}) {
  const { spec, preset, bytes, update, props } = studio;
  const tooBig = bytes > MAX_SPEC_BYTES;
  return (
    <div className="flex flex-col gap-2 rounded-card border border-line bg-surface px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-0 flex-[1_1_220px] items-center gap-2 text-[13px] font-medium text-ink-soft">
          <span className="shrink-0">Dispositivo</span>
          <select value={spec.device} onChange={(e) => update({ device: e.target.value })} className={`${inputClass} w-full min-w-0 sm:max-w-96`}>
            {presetsFor(props.store).map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} · {p.note}
              </option>
            ))}
          </select>
        </label>
        <span className="font-mono text-label text-muted">
          {preset.width}×{preset.height} px
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="ghost" aria-pressed={overview} onClick={() => setOverview(!overview)} className={overview ? "bg-brand-soft text-brand-strong" : undefined}>
            <GalleryHorizontal size={16} aria-hidden="true" />
            Vista del set completo
          </Button>
          <Button onClick={exporter.exportAll} disabled={exporter.exporting}>
            <Download size={16} aria-hidden="true" />
            {exporter.exporting ? "Exportando…" : "Descargar ZIP"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Más opciones de descarga">
                <MoreHorizontal size={16} aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => void exporter.exportOne()} disabled={exporter.exporting}>
                Descargar PNG de esta pantalla
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="primary" onClick={exporter.save} disabled={exporter.saving || tooBig}>
            {exporter.saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>
      <StatusLine studio={studio} className="text-xs" />
      {tooBig && (
        <p className="text-xs text-warn-fg">El conjunto pesa {(bytes / 1_000_000).toFixed(1)} MB; el máximo es 3,5 MB. Quita alguna captura.</p>
      )}
    </div>
  );
}
