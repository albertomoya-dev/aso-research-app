"use client";

import { useActionState, useMemo, useState } from "react";
import { discardDraft, type DraftState, saveDraft } from "@/app/ai-actions";
import { appendToKeywordField, charCount, checkMetadata, type FieldKey, FIELDS, type MetadataDraft } from "@/lib/metadata-check";
import type { Store } from "@/lib/stores/types";
import { buttonPrimary, buttonSecondary, Card, inputClass } from "./ui";

type Props = {
  appId: number;
  store: Store;
  initial: MetadataDraft;
  published: MetadataDraft;
  hasDraft: boolean;
  keywords: string[];
};

export function MetadataEditor({ appId, store, initial, published, hasDraft, keywords }: Props) {
  const [draft, setDraft] = useState(initial);
  const [state, action, pending] = useActionState<DraftState, FormData>(saveDraft, null);
  const report = useMemo(() => checkMetadata(store, draft, keywords), [store, draft, keywords]);
  const set = (key: FieldKey, value: string) => setDraft((d) => ({ ...d, [key]: value }));
  const labels = Object.fromEntries(FIELDS[store].map((f) => [f.key, f.label])) as Record<FieldKey, string>;
  const covered = report.coverage.filter((c) => c.covered).length;
  const extra = appendToKeywordField(draft.keywordField, report.missingWords);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
      <Card className="px-5 py-5">
        <form action={action} className="flex flex-col gap-5">
          <input type="hidden" name="appId" value={appId} />
          {/* Fields of the other store are kept so switching stores never loses text. */}
          {(Object.keys(draft) as FieldKey[])
            .filter((k) => !FIELDS[store].some((f) => f.key === k))
            .map((k) => (
              <input key={k} type="hidden" name={k} value={draft[k]} />
            ))}
          {report.fields.map((f) => {
            const id = `field-${f.key}`;
            const changed = draft[f.key] !== published[f.key];
            const props = {
              id,
              name: f.key,
              value: draft[f.key],
              onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(f.key, e.target.value),
              "aria-describedby": `${id}-count`,
              "aria-invalid": f.over || undefined,
              className: `${inputClass} w-full ${f.over ? "border-danger" : ""}`,
            };
            return (
              <div key={f.key} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <label htmlFor={id} className="text-[13px] font-medium text-ink-soft">
                    {f.label}
                    {changed && <span className="ml-2 text-xs font-normal text-link">modificado</span>}
                  </label>
                  <span id={`${id}-count`} className={`font-mono text-xs ${f.over ? "font-semibold text-danger" : "text-muted"}`}>
                    {f.length}/{f.limit}
                  </span>
                </div>
                {f.multiline ? <textarea rows={10} {...props} className={`${props.className} py-2.5`} /> : <input {...props} />}
                {f.hint && <p className="text-xs text-muted">{f.hint}</p>}
                {f.key === "keywordField" && report.missingWords.length > 0 && (
                  <button
                    type="button"
                    onClick={() => set("keywordField", extra)}
                    className="self-start text-[13px] font-medium text-link hover:underline"
                  >
                    Añadir las palabras que faltan ({report.missingWords.length}) → {charCount(extra)}/100
                  </button>
                )}
              </div>
            );
          })}
          <div className="flex flex-wrap items-center gap-2.5">
            <button type="submit" disabled={pending} className={buttonPrimary}>
              {pending ? "Guardando…" : "Guardar borrador"}
            </button>
            <button type="button" className={buttonSecondary} onClick={() => setDraft(published)}>
              Volver a la ficha publicada
            </button>
            {hasDraft && (
              <button type="submit" formAction={discardDraft} className={`${buttonSecondary} text-danger`}>
                Borrar borrador
              </button>
            )}
            <span aria-live="polite" className="text-[13px] text-muted">
              {state?.error && <span className="text-danger">{state.error}</span>}
              {state?.savedAt && "Borrador guardado"}
            </span>
          </div>
        </form>
      </Card>

      <div className="flex flex-col gap-6">
        <Card aria-label="Avisos" className="px-5 py-4">
          <h2 className="text-[15px] font-semibold">Avisos</h2>
          {report.issues.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Todo dentro de los límites.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2 text-sm">
              {report.issues.map((issue) => (
                <li
                  key={issue.text}
                  className={`rounded-lg px-3 py-2 ${issue.level === "error" ? "bg-danger-soft text-danger" : "bg-warn-bg text-warn-fg"}`}
                >
                  {issue.text}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card aria-label="Cobertura de keywords" className="overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-[15px] font-semibold">Cobertura de keywords</h2>
            <p className="mt-1 text-[13px] text-muted">
              {keywords.length === 0
                ? "Aún no sigues ninguna keyword."
                : `${covered} de ${keywords.length} tienen todas sus palabras en ${store === "ios" ? "nombre, subtítulo o campo de keywords" : "título o descripciones"}.`}
            </p>
          </div>
          <ul className="max-h-[480px] overflow-y-auto">
            {report.coverage.map((c) => (
              <li key={c.term} className="flex items-start justify-between gap-3 border-b border-line px-5 py-2.5 text-sm last:border-0">
                <span>
                  <span className={c.covered ? "" : "text-ink-soft"}>{c.term}</span>
                  {c.missing.length > 0 && <span className="block text-xs text-muted">Falta: {c.missing.join(", ")}</span>}
                </span>
                <span className="shrink-0 text-right text-xs">
                  {c.exactIn ? (
                    <span className="font-semibold text-up">En {labels[c.exactIn]?.toLowerCase()}</span>
                  ) : c.covered ? (
                    <span className="text-ink-soft">Palabras sueltas</span>
                  ) : (
                    <span className="text-down">No cubierta</span>
                  )}
                  {c.descriptionCount != null && c.descriptionCount > 0 && (
                    <span className="block text-muted">{c.descriptionCount}× en descripción</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
