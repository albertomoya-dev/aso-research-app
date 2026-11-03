"use client";

import { Download, Sparkles, Trash2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { removeKeywords, restoreKeywords, type RemovedKeyword } from "@/app/actions";
import { recalculateSelected, setKeywordsRelevance } from "@/app/keyword-actions";
import { Button } from "@/components/ui/button";
import { SelectionBar } from "@/components/ui/data-table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { downloadCsv } from "@/lib/download";
import { keywordsCsv, type TableRow } from "@/lib/keyword-table";

/** Seconds «Deshacer» stays on screen after removing keywords. */
export const UNDO_SECONDS = 15;

const LEVELS = [
  { value: 5, label: "5 · Exacta" },
  { value: 4, label: "4 · Muy relevante" },
  { value: 3, label: "3 · Relacionada" },
  { value: 2, label: "2 · Poco" },
  { value: 1, label: "1 · Nada" },
];

/** «Quitar» with «Deshacer» in a toast for UNDO_SECONDS: the position history is kept, so nothing is lost. */
export function useRemoveKeywords(appId: number) {
  const [pending, startTransition] = useTransition();
  const remove = (ids: number[], onDone?: () => void) =>
    startTransition(async () => {
      const result = await removeKeywords(appId, ids);
      if (result.error) return void toast.error(result.error);
      onDone?.();
      const rows: RemovedKeyword[] = result.removed;
      toast(rows.length === 1 ? `«${rows[0].term}» quitada` : `${rows.length} keywords quitadas`, {
        description: "Su histórico de posiciones se conserva.",
        duration: UNDO_SECONDS * 1000,
        action: {
          label: "Deshacer",
          onClick: async () => {
            const restored = await restoreKeywords(appId, rows);
            if (restored.error) toast.error(restored.error);
            else toast.success(restored.restored === 1 ? "1 keyword recuperada" : `${restored.restored} keywords recuperadas`);
          },
        },
      });
    });
  return { remove, pending };
}

/**
 * The floating bar of the keyword table when rows are ticked: «Cambiar relevancia», «Recalcular con IA»,
 * «Exportar CSV» and «Quitar» (with «Deshacer»). Evolves the old BulkRemoveBar.
 */
export function KeywordSelectionBar({
  appId,
  rows,
  aiEnabled,
  fileName,
  onClear,
}: {
  appId: number;
  rows: TableRow[];
  aiEnabled: boolean;
  fileName: string;
  onClear: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const { remove, pending: removing } = useRemoveKeywords(appId);
  const ids = rows.map((r) => r.id);
  const busy = pending || removing;

  const setRelevance = (value: number) =>
    startTransition(async () => {
      const result = await setKeywordsRelevance(appId, ids, value);
      if (result.error) toast.error(result.error);
      else toast.success(`Relevancia ${value} en ${result.updated === 1 ? "1 keyword" : `${result.updated} keywords`}`);
    });
  const recalculate = () =>
    startTransition(async () => {
      const result = await recalculateSelected(appId, ids);
      if (result.error) toast.error(result.error);
      else toast.success(result.asked === 0 ? "Todas las elegidas tienen relevancia tuya: la IA no las cambia." : `${result.rated} de ${result.asked} valoradas con IA`);
    });

  return (
    <SelectionBar count={rows.length} onClear={onClear}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="sm" disabled={busy}>
            Cambiar relevancia
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="top">
          <DropdownMenuLabel>Tu relevancia (la IA no la cambia)</DropdownMenuLabel>
          {LEVELS.map((l) => (
            <DropdownMenuItem key={l.value} onSelect={() => setRelevance(l.value)}>
              {l.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {aiEnabled && (
        <Button variant="secondary" size="sm" onClick={recalculate} disabled={busy} aria-busy={pending} title="Una petición a Claude por cada 100. No cambia las que has valorado tú.">
          <Sparkles size={16} aria-hidden="true" />
          Recalcular con IA
        </Button>
      )}
      <Button variant="secondary" size="sm" onClick={() => downloadCsv(fileName, keywordsCsv(rows))}>
        <Download size={16} aria-hidden="true" />
        Exportar CSV
      </Button>
      <Button variant="secondary" size="sm" className="text-danger" onClick={() => remove(ids, onClear)} disabled={busy} aria-busy={removing}>
        <Trash2 size={16} aria-hidden="true" />
        {removing ? "Quitando…" : "Quitar"}
      </Button>
    </SelectionBar>
  );
}
