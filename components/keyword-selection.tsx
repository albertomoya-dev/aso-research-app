"use client";

import { createContext, use, useEffect, useState, useTransition } from "react";
import { removeKeywords, restoreKeywords, type RemovedKeyword } from "@/app/actions";
import { buttonSecondary } from "./ui";

/** Seconds «Deshacer» stays on screen after removing keywords. */
const UNDO_SECONDS = 15;

type Selection = {
  selected: Set<number>;
  toggle: (id: number) => void;
  setMany: (ids: number[], on: boolean) => void;
};

const SelectionContext = createContext<Selection | null>(null);

function useSelection(): Selection {
  const ctx = use(SelectionContext);
  if (!ctx) throw new Error("KeywordSelection missing");
  return ctx;
}

/**
 * Multi-select for the keyword table, which stays a server component: the provider wraps it and
 * only the checkboxes and the action bar are client components.
 */
export function KeywordSelection({ children }: { children: React.ReactNode }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const setMany = (ids: number[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  return <SelectionContext value={{ selected, toggle, setMany }}>{children}</SelectionContext>;
}

export function RowCheckbox({ id, term }: { id: number; term: string }) {
  const { selected, toggle } = useSelection();
  return (
    <input
      type="checkbox"
      aria-label={`Seleccionar ${term}`}
      checked={selected.has(id)}
      onChange={() => toggle(id)}
      className="size-5 accent-[var(--brand)] md:size-4"
    />
  );
}

/** Ticks or unticks every row shown with the current filter. */
export function SelectAllCheckbox({ ids }: { ids: number[] }) {
  const { selected, setMany } = useSelection();
  const all = ids.length > 0 && ids.every((id) => selected.has(id));
  return (
    <input
      type="checkbox"
      aria-label={all ? "Quitar selección" : "Seleccionar todas las visibles"}
      checked={all}
      disabled={ids.length === 0}
      onChange={() => setMany(ids, !all)}
      className="size-5 accent-[var(--brand)] md:size-4"
    />
  );
}

/** «Quitar seleccionadas» with confirmation, and «Deshacer» for a few seconds afterwards. */
export function BulkRemoveBar({ appId, terms }: { appId: number; terms: Record<number, string> }) {
  const { selected, setMany } = useSelection();
  const [pending, startTransition] = useTransition();
  const [undo, setUndo] = useState<{ rows: RemovedKeyword[]; left: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const ids = [...selected].filter((id) => id in terms);

  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo((u) => (u && u.left > 1 ? { ...u, left: u.left - 1 } : null)), 1000);
    return () => clearTimeout(timer);
  }, [undo]);

  const remove = () => {
    const names = ids.slice(0, 5).map((id) => `«${terms[id]}»`).join(", ");
    const more = ids.length > 5 ? ` y ${ids.length - 5} más` : "";
    if (!window.confirm(`¿Dejar de seguir ${ids.length === 1 ? "esta keyword" : `estas ${ids.length} keywords`}? ${names}${more}.\n\nPodrás deshacerlo durante ${UNDO_SECONDS} segundos.`)) return;
    startTransition(async () => {
      const result = await removeKeywords(appId, ids);
      if (result.error) {
        setMessage(result.error);
        return;
      }
      setMany(ids, false);
      setMessage(null);
      setUndo({ rows: result.removed, left: UNDO_SECONDS });
    });
  };

  const restore = () => {
    if (!undo) return;
    const rows = undo.rows;
    setUndo(null);
    startTransition(async () => {
      const result = await restoreKeywords(appId, rows);
      setMessage(result.error ?? (result.restored === 1 ? "1 keyword recuperada." : `${result.restored} keywords recuperadas.`));
    });
  };

  if (ids.length === 0 && !undo && !message) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface-muted px-5 py-2.5 text-[13px]" aria-live="polite">
      {undo ? (
        <>
          <span className="text-ink-soft">
            {undo.rows.length === 1 ? "1 keyword quitada" : `${undo.rows.length} keywords quitadas`}. Su histórico de posiciones se conserva.
          </span>
          <button type="button" onClick={restore} disabled={pending} className={buttonSecondary}>
            Deshacer ({undo.left} s)
          </button>
        </>
      ) : (
        message && <span className="text-ink-soft">{message}</span>
      )}
      {ids.length > 0 && (
        <>
          <span className="ml-auto text-ink-soft">{ids.length === 1 ? "1 seleccionada" : `${ids.length} seleccionadas`}</span>
          <button type="button" onClick={() => setMany(ids, false)} className={buttonSecondary}>
            Quitar selección
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            aria-busy={pending}
            className={`${buttonSecondary} text-danger`}
          >
            {pending ? "Quitando…" : "Quitar seleccionadas"}
          </button>
        </>
      )}
    </div>
  );
}
