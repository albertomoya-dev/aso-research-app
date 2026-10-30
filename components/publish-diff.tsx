import type { PreviewField } from "@/lib/publications";

/** Field-by-field preview of a publication: what the store has now and what Rankeo would send. */
export function PublishDiff({ changes, unchanged, liveLabel }: { changes: PreviewField[]; unchanged: string[]; liveLabel: string }) {
  return (
    <div className="flex flex-col gap-4">
      {changes.length === 0 ? (
        <p className="text-sm text-muted">El borrador es igual que lo que hay ahora en la consola: no hay nada que publicar.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {changes.map((c) => (
            <li key={c.field} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-[13px] font-semibold">{c.label}</h3>
                <span className={`font-mono text-xs ${c.over ? "text-danger" : "text-muted"}`}>
                  {c.length}/{c.limit}
                </span>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="min-w-0 rounded-lg border border-line bg-surface-muted px-3 py-2">
                  <div className="text-[11px] tracking-wider text-muted uppercase">{liveLabel}</div>
                  <p className={`mt-1 text-sm text-ink-soft ${c.multiline ? "max-h-56 overflow-y-auto whitespace-pre-wrap" : "break-words"}`}>
                    {c.before || <span className="text-muted italic">(vacío)</span>}
                  </p>
                </div>
                <div className="min-w-0 rounded-lg border border-line-strong px-3 py-2">
                  <div className="text-[11px] tracking-wider text-muted uppercase">Tu borrador</div>
                  <p className={`mt-1 text-sm ${c.multiline ? "max-h-56 overflow-y-auto whitespace-pre-wrap" : "break-words"}`}>
                    {c.after || <span className="text-muted italic">(vacío)</span>}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {unchanged.length > 0 && <p className="text-[13px] text-muted">Sin cambios: {unchanged.join(", ")}.</p>}
    </div>
  );
}
